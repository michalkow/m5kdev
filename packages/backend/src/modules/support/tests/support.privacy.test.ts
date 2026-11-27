import { drizzle } from "drizzle-orm/node-postgres";
import { createServiceActor } from "../../../base/base.actor";
import { createServerEventBus } from "../../../base/server-event";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { logger } from "../../../utils/logger";
import * as authTables from "../../auth/auth.db";
import { defaultAuthGrants } from "../../auth/auth.grants";
import * as oauthTables from "../../auth/auth.oauth.db";
import {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "../../auth/auth.repository";
import { AuthService } from "../../auth/auth.service";
import { EmailService } from "../../email/email.service";
import { taggings, tags } from "../../tag/tag.db";
import * as tables from "../support.db";
import { SupportRepository } from "../support.repository";
import { SupportService } from "../support.service";

const ctx = (userId: string, userRole = "user") => ({
  actor: createServiceActor({ userId, userRole }),
  user: null,
  session: null,
});
it("keeps grace-period staff access but invalidates autonomous work across Close and Restore", async () => {
  const pool = createTestPool();
  const schema = { ...authTables, ...oauthTables, tags, taggings, ...tables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(authTables.users).values([
    { id: "user", name: "User", email: "user@local.test", emailVerified: true },
    { id: "staff", name: "Staff", email: "staff@local.test", role: "admin", emailVerified: true },
  ]);
  const template = { id: "fixture", react: () => null };
  const email = new EmailService({
    templates: {
      accountDeletion: template,
      verification: template,
      passwordReset: template,
      organizationInvite: template,
    },
    mode: "store",
  });
  const bus = createServerEventBus({ logger, channelPrefix: "local-support-privacy:" });
  const auth = new AuthService(
    {
      accountClaim: new AuthAccountClaimRepository({
        orm,
        schema,
        table: authTables.accountClaims,
      }),
      user: new AuthUserRepository({ orm, schema, table: authTables.users }),
      invitation: new AuthInvitationRepository({ orm, schema, table: authTables.invitations }),
      waitlist: new AuthWaitlistRepository({ orm, schema, table: authTables.waitlist }),
      organization: new AuthOrganizationRepository({
        orm,
        schema,
        table: authTables.organizations,
      }),
    },
    { email },
    defaultAuthGrants,
    bus
  );
  let calls = 0;
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    {},
    undefined,
    {
      locales: ["en", "pl"],
      translation: {
        id: "privacy-fixture",
        languages: ["en", "pl"],
        translate: async () => {
          calls++;
          return { text: "Old automatic reply" };
        },
      },
    }
  );
  try {
    const settings = await support.saveSettings(
      {
        expectedVersion: 0,
        nativeLocales: ["en", "pl"],
        fallbackLocale: "en",
        translation: {
          enabled: true,
          budget: {
            monthlyCalls: 4,
            dailyUserCalls: 4,
            maxInputCharacters: 20000,
            maxOutputCharacters: 20000,
            concurrency: 1,
            attempts: 1,
            timeoutMs: 5000,
          },
        },
        ai: { enabled: false },
      },
      ctx("staff", "admin")
    );
    if (settings.isErr()) throw settings.error;
    const created = await support.createCase(
      { clientId: "privacy", subject: "Private", body: "Question", uiLocale: "pl" },
      ctx("user")
    );
    if (created.isErr()) throw created.error;
    const reply = await support.sendMessage(
      { id: created.value.id, clientId: "queued-before-close", body: "Old authored reply" },
      ctx("staff", "admin")
    );
    if (reply.isErr()) throw reply.error;
    // Auth remains authoritative even if Support was temporarily omitted at Close/Restore.
    const closed = await auth.closeUser({ email: "user@local.test" }, ctx("user"));
    if (closed.isErr()) throw closed.error;
    const denied = await support.getCase({ id: created.value.id }, ctx("user"));
    expect(denied.isErr() && denied.error.code).toBe("UNAUTHORIZED");
    expect((await support.getCase({ id: created.value.id }, ctx("staff", "admin"))).isOk()).toBe(
      true
    );
    const restored = await auth.restoreUser({ id: "user" }, ctx("staff", "admin"));
    if (restored.isErr()) throw restored.error;
    await support.processWork();
    expect(calls).toBe(0);
    const view = await support.getCase({ id: created.value.id }, ctx("user"));
    if (view.isErr()) throw view.error;
    expect(view.value.messages.map((message) => message.body)).toEqual(["Question"]);
    auth.registerUserLifecycleParticipant("support", {
      beforeClose: (id) => support.invalidateUserWork(id, "closed"),
      beforeRestore: (id) => support.invalidateUserWork(id, "restored"),
      beforePurge: (id) => support.purgeUserData(id),
    });
    await auth.closeUser({ email: "user@local.test" }, ctx("user"));
    const purged = await auth.purgeUser({ id: "user" }, ctx("staff", "admin"));
    if (purged.isErr()) throw purged.error;
    const missing = await support.getCase({ id: created.value.id }, ctx("staff", "admin"));
    expect(missing.isErr() && missing.error.code).toBe("NOT_FOUND");
  } finally {
    await bus.close();
    await pool.end();
  }
});
