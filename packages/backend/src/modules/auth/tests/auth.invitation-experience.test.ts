import fs from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { createElement } from "react";
import { createBackendApp } from "../../../app";
import { createServiceActor } from "../../../base/base.actor";
import { ExperienceRegistry, type ExperienceRequest } from "../../../experience";
import { ExperienceFlowSigner, type LegacyExperienceFlowPolicy } from "../../../experience-flows";
import { experienceConfig, prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { EmailModule } from "../../email/email.module";
import type { EmailService } from "../../email/email.service";
import * as schema from "../auth.db";
import { defaultAuthGrants } from "../auth.grants";
import { createBetterAuth } from "../auth.lib";
import { AuthModule } from "../auth.module";
import { AuthService } from "../auth.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const SECRET = "invitation-test-secret-at-least-thirty-two-characters";
async function fixture(
  options: {
    sharedApi?: boolean;
    splitApi?: boolean;
    socialEmail?: string;
    legacy?: boolean;
    legacyPolicy?: LegacyExperienceFlowPolicy;
  } = {}
) {
  const client = createTestPool();
  await prepareExperienceTables(client, schema);
  const orm = drizzle(client, { schema });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-invitations-"));
  const template = {
    id: "invitation",
    react: ({ brand, url }: Record<string, unknown>) =>
      createElement("a", { href: String(url) }, (brand as { name: string }).name),
  };
  const built = createBackendApp(
    {
      schema,
      db: { client },
      experienceFlowSecret: SECRET,
      experienceFlowLegacyPolicy: options.legacyPolicy,
      app: {
        locales: {
          defaultLocale: "en",
          locales: [
            { code: "en", displayName: "English" },
            { code: "en_GB", displayName: "English (UK)" },
          ],
        },
        ...(options.legacy
          ? {
              name: "Legacy",
              urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
            }
          : {
              experiences: {
                ...experienceConfig,
                emailProfiles: {
                  radar: {
                    from: "Radar <radar@example.test>",
                    systemNotificationEmail: "ops-radar@example.test",
                  },
                  horeka: {
                    from: "Horeka <horeka@example.test>",
                    systemNotificationEmail: "ops-horeka@example.test",
                  },
                },
                definitions: {
                  ...experienceConfig.definitions,
                  radar: {
                    ...experienceConfig.definitions.radar,
                    ...(options.sharedApi ? { apiOrigin: "https://api.example.test" } : {}),
                    ...(options.splitApi ? { apiOrigin: "https://a-api.example.test" } : {}),
                    emailProfile: "radar",
                  },
                  partner: {
                    ...experienceConfig.definitions.partner,
                    ...(options.splitApi ? { apiOrigin: "https://bc-api.example.test" } : {}),
                  },
                  horeka: {
                    ...experienceConfig.definitions.horeka,
                    ...(options.sharedApi ? { apiOrigin: "https://api.example.test" } : {}),
                    ...(options.splitApi ? { apiOrigin: "https://bc-api.example.test" } : {}),
                    emailProfile: "horeka",
                  },
                },
              },
            }),
      },
      email: { mode: "store", from: "Legacy <legacy@example.test>", outputDirectory: directory },
    },
    [
      new EmailModule({
        verification: template,
        passwordReset: template,
        accountDeletion: template,
        organizationInvite: template,
        waitlistConfirmation: template,
        waitlistInvite: template,
        waitlistUserInvite: template,
        systemWaitlistNotification: template,
      }),
      new AuthModule(),
    ] as const
  );
  const auth = built.modules.auth.services.auth as AuthService;
  const email = built.modules.email.services.email as EmailService;
  const registry = built.config.app.experienceRegistry!;
  const [owner] = await orm
    .insert(schema.users)
    .values({
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      role: "user",
      emailVerified: true,
    })
    .returning();
  await orm
    .insert(schema.organizations)
    .values({ id: "organization", name: "Shared Organization", slug: "shared", locale: "en_GB" });
  await orm.insert(schema.members).values({
    id: "owner-member",
    organizationId: "organization",
    userId: "owner",
    name: "Owner",
    email: owner.email,
    role: "owner",
  });
  const ownerContext = (id: string) => ({
    experience: options.legacy ? registry.defaultExperience : registry.get(id),
    user: owner,
    actor: createServiceActor({
      userId: "owner",
      userRole: "user",
      organizationId: "organization",
      organizationRole: "owner",
      memberId: "owner-member",
    }),
  });
  const betterAuth = createBetterAuth({
    orm,
    schema,
    services: { auth, email },
    app: built.config.app,
    experienceFlows: new ExperienceFlowSigner(registry, SECRET, {
      legacyPolicy: options.legacyPolicy,
    }),
    config: { waitlist: true },
    options: {
      secret: SECRET,
      rateLimit: { enabled: false },
      socialProviders: {
        google: {
          clientId: "test-client",
          clientSecret: "test-secret",
          getUserInfo: async () => ({
            user: {
              id: "external-person",
              name: "Social User",
              email: options.socialEmail ?? "social@example.test",
              emailVerified: true,
            },
            data: { sub: "external-person" },
          }),
        },
      },
    },
  });
  return {
    auth,
    built,
    betterAuth,
    email,
    orm,
    registry,
    ownerContext,
    close: async () => {
      await built.shutdown();
      await client.end();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

describe("Experience-bound invitations", () => {
  it("issues concurrent A/B invitation emails with their own signed canonical acceptance links", async () => {
    const f = await fixture();
    try {
      const results = await Promise.all(
        ["radar", "horeka"].map((id) =>
          f.auth.inviteOrganizationMember(
            { email: `${id}-invitee@example.test`, role: "member" },
            f.ownerContext(id)
          )
        )
      );
      expect(results.every((result) => result.isOk())).toBe(true);
      for (const [id, name, from] of [
        ["radar", "Gastro Raider", "Radar"],
        ["horeka", "Horeka AI", "Horeka"],
      ]) {
        const email = await f.email.findLatestStoredEmail({ to: `${id}-invitee@example.test` });
        expect(email?.from).toBe(`${from} <${id}@example.test>`);
        const link = new URL(String(email?.props.url));
        expect(link.origin).toBe(`https://${id}.example.test`);
        expect(link.searchParams.get("experienceFlow")).toMatch(/\S+\.\S+/);
        expect(email?.html).toContain(name);
        expect(email?.html).toContain(`https://${id}.example.test/organization/accept-invitation`);
      }
    } finally {
      await f.close();
    }
  });
  it("rejects missing/cross-brand invitation continuations before attaching the User and consumes the original Membership once", async () => {
    const f = await fixture();
    try {
      const issued = await f.auth.inviteOrganizationMember(
        { email: "new@example.test", role: "member" },
        f.ownerContext("radar")
      );
      if (issued.isErr()) throw issued.error;
      const mail = await f.email.findLatestStoredEmail({ to: "new@example.test" });
      const url = new URL(String(mail?.props.url));
      const input = {
        id: issued.value.invitation.id,
        experienceFlow: url.searchParams.get("experienceFlow")!,
      };
      const [user] = await f.orm
        .insert(schema.users)
        .values({
          id: "new-user",
          email: "new@example.test",
          name: "New",
          role: "user",
          emailVerified: true,
        })
        .returning();
      const context = (id: string) => ({
        experience: f.registry.get(id),
        user,
        actor: createServiceActor({ userId: user.id, userRole: "user" }),
      });
      expect(
        (
          await f.auth.readInvitation(input, {
            experience: f.registry.get("radar"),
            user: null,
            actor: null,
          })
        ).isOk()
      ).toBe(true);
      expect(
        (
          await f.auth.readInvitation(input, {
            experience: f.registry.get("horeka"),
            user: null,
            actor: null,
          })
        ).isErr()
      ).toBe(true);
      expect(
        (
          await f.auth.readInvitation(
            { id: input.id },
            { experience: f.registry.get("radar"), user: null, actor: null }
          )
        ).isErr()
      ).toBe(true);
      expect((await f.auth.acceptOrganizationInvitation(input, context("horeka"))).isErr()).toBe(
        true
      );
      const accepted = await f.auth.acceptOrganizationInvitation(input, context("radar"));
      expect(accepted.isOk() && accepted.value.memberId).toBe(issued.value.member.id);
      const members = await f.auth.listOrganizationMembers(undefined, f.ownerContext("radar"));
      expect(
        members.isOk() &&
          members.value.find((member) => member.id === issued.value.member.id)?.userId
      ).toBe(user.id);
      expect((await f.auth.acceptOrganizationInvitation(input, context("radar"))).isErr()).toBe(
        true
      );
      expect(
        (
          await f.auth.readInvitation(input, {
            experience: f.registry.get("radar"),
            user: null,
            actor: null,
          })
        ).isErr()
      ).toBe(true);
    } finally {
      await f.close();
    }
  });

  it("validates invitation presentation before password signup can create a User or attach Membership", async () => {
    const f = await fixture();
    try {
      const issued = await f.auth.inviteOrganizationMember(
        { email: "signup@example.test", role: "member" },
        f.ownerContext("radar")
      );
      if (issued.isErr()) throw issued.error;
      const mail = await f.email.findLatestStoredEmail({ to: "signup@example.test" });
      const proof = new URL(String(mail?.props.url)).searchParams.get("experienceFlow")!;
      const signup = (brand: string, continuation?: string) =>
        f.betterAuth.api.signUpEmail({
          headers: new Headers({
            host: `${brand}.example.test`,
            origin: `https://${brand}.example.test`,
            "organization-invitation-code": issued.value.invitation.id,
            ...(continuation !== undefined ? { "X-M5kdev-Experience-Flow": continuation } : {}),
          }),
          body: { name: "Signup", email: "signup@example.test", password: "Valid-Password-123" },
        });
      await expect(signup("horeka", proof)).rejects.toMatchObject({ status: "BAD_REQUEST" });
      await expect(signup("radar")).rejects.toMatchObject({ status: "BAD_REQUEST" });
      const result = await signup("radar", proof);
      expect(result.user.email).toBe("signup@example.test");
      const members = await f.auth.listOrganizationMembers(undefined, f.ownerContext("radar"));
      expect(
        members.isOk() && members.value.find((row) => row.id === issued.value.member.id)?.userId
      ).toBe(result.user.id);
    } finally {
      await f.close();
    }
  });

  it("issues a branded waitlist signup and enforces its bound code through validation and password signup", async () => {
    const f = await fixture();
    try {
      const issued = await f.auth.inviteToWaitlist(
        { email: "friend@example.test", name: "Friend" },
        f.ownerContext("horeka")
      );
      expect(issued.isOk()).toBe(true);
      const email = await f.email.findLatestStoredEmail({ to: "friend@example.test" });
      expect(email?.from).toBe("Horeka <horeka@example.test>");
      const url = new URL(String(email?.props.url));
      expect(url.origin).toBe("https://horeka.example.test");
      const input = {
        code: url.searchParams.get("code")!,
        experienceFlow: url.searchParams.get("experienceFlow")!,
      };
      const pub = (id: string) => ({ experience: f.registry.get(id), user: null, actor: null });
      const valid = await f.auth.validateWaitlistCode(input, pub("horeka"));
      expect(valid.isOk() && valid.value.status).toBe("VALID");
      expect((await f.auth.validateWaitlistCode(input, pub("radar"))).isErr()).toBe(true);
      const signup = (id: string) =>
        f.betterAuth.api.signUpEmail({
          headers: new Headers({
            host: `${id}.example.test`,
            origin: `https://${id}.example.test`,
            "waitlist-invitation-code": input.code,
            "X-M5kdev-Experience-Flow": input.experienceFlow,
          }),
          body: { name: "Friend", email: "friend@example.test", password: "Valid-Password-123" },
        });
      await expect(signup("radar")).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect((await signup("horeka")).user.email).toBe("friend@example.test");
      const consumed = await f.auth.validateWaitlistCode(input, pub("horeka"));
      expect(consumed.isOk() && consumed.value.status).toBe("INVALID");
    } finally {
      await f.close();
    }
  });

  it("rejects a conflicting shared-API OAuth callback even when the provider denies consent, without redirecting", async () => {
    const f = await fixture({ sharedApi: true });
    try {
      const start = await f.betterAuth.handler(
        new Request("https://api.example.test/api/auth/sign-in/social", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            host: "api.example.test",
            origin: "https://horeka.example.test",
          },
          body: JSON.stringify({
            provider: "google",
            callbackURL: "https://horeka.example.test/",
            additionalData: { experienceId: "radar" },
          }),
        })
      );
      expect(start.status).toBe(200);
      const provider = new URL((await start.json()).url);
      const state = provider.searchParams.get("state");
      const cookie = start.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const response = await f.betterAuth.handler(
        new Request(
          `https://api.example.test/api/auth/callback/google?${new URLSearchParams({ state: state!, error: "access_denied" })}`,
          {
            headers: { host: "api.example.test", origin: "https://radar.example.test", cookie },
          }
        )
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
    } finally {
      await f.close();
    }
  });

  it("stores an exact requested claim's bound magic link and retains that claim through sign-in and acceptance", async () => {
    const f = await fixture();
    const transport = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) =>
        f.betterAuth.handler(new Request(String(url), options))
      );
    try {
      const [user] = await f.orm
        .insert(schema.users)
        .values({
          id: "provisioned",
          name: "Provisioned",
          email: "provisioned@example.test",
          emailVerified: false,
          role: "user",
        })
        .returning();
      const admin = {
        ...f.ownerContext("radar"),
        actor: createServiceActor({ userId: "owner", userRole: "admin" }),
      };
      const first = await f.auth.createAccountClaimCode({ userId: user.id }, admin);
      const second = await f.auth.createAccountClaimCode({ userId: user.id }, admin);
      if (first.isErr() || second.isErr()) throw new Error("Expected pending claims");
      const issued = await f.auth.generateAccountClaimMagicLink(
        { claimId: first.value.id, email: "claimed@example.test" },
        admin
      );
      if (issued.isErr()) throw issued.error;
      expect(issued.value.claimId).toBe(first.value.id);
      const magic = new URL(issued.value.url);
      const callback = new URL(magic.searchParams.get("callbackURL")!);
      expect(magic.origin).toBe("https://radar.example.test");
      expect(callback.searchParams.get("claim")).toBe(first.value.id);
      expect(callback.searchParams.get("claimFlow")).toMatch(/\S+\.\S+/);
      expect(callback.searchParams.get("experienceFlow")).toMatch(/\S+\.\S+/);
      const wrong = new URL(magic);
      wrong.host = "horeka.example.test";
      const rejected = await f.betterAuth.handler(
        new Request(wrong, { headers: { host: wrong.host } })
      );
      expect(rejected.status).toBe(400);
      expect(rejected.headers.get("set-cookie") ?? "").not.toContain("session_token");
      const signedIn = await f.betterAuth.handler(
        new Request(magic, { headers: { host: magic.host } })
      );
      expect(signedIn.status).toBe(302);
      expect(new URL(signedIn.headers.get("location")!).origin).toBe("https://radar.example.test");
      expect(signedIn.headers.getSetCookie().join(";")).toContain("session_token");
      const input = {
        claimId: first.value.id,
        experienceFlow: callback.searchParams.get("claimFlow")!,
      };
      const cookies = signedIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const setPassword = (includeProof: boolean) =>
        f.betterAuth.handler(
          new Request("https://radar.example.test/api/auth/set-password", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "radar.example.test",
              origin: "https://radar.example.test",
              cookie: cookies,
            },
            body: JSON.stringify({
              newPassword: "Permanent-Password-123",
              ...(includeProof ? input : {}),
            }),
          })
        );
      expect((await setPassword(false)).status).toBe(400);
      expect((await setPassword(true)).status).toBe(200);
      const context = {
        user: { ...user, email: "claimed@example.test" },
        actor: createServiceActor({ userId: user.id, userRole: "user" }),
        experience: f.registry.get("radar"),
      };
      const status = await f.auth.getMyAccountClaimStatus(input, context);
      expect(status.isOk() && status.value?.id).toBe(first.value.id);
      expect(
        (
          await f.auth.acceptMyAccountClaim(input, {
            ...context,
            experience: f.registry.get("horeka"),
          })
        ).isErr()
      ).toBe(true);
      expect((await f.auth.acceptMyAccountClaim(input, context)).isOk()).toBe(true);
      const claims = await f.auth.listAccountClaims(undefined, admin);
      expect(claims.isOk() && claims.value.find((row) => row.id === first.value.id)?.status).toBe(
        "ACCEPTED"
      );
      expect(claims.isOk() && claims.value.find((row) => row.id === second.value.id)?.status).toBe(
        "INVITED"
      );
      expect(
        (
          await f.betterAuth.handler(new Request(magic, { headers: { host: magic.host } }))
        ).headers.get("set-cookie") ?? ""
      ).not.toContain("session_token");
    } finally {
      transport.mockRestore();
      await f.close();
    }
  });

  it("issues protected canonical share links for existing invitations and owned waitlist codes", async () => {
    const f = await fixture();
    try {
      const invitation = await f.auth.inviteOrganizationMember(
        { email: "copy@example.test", role: "member" },
        f.ownerContext("radar")
      );
      const code = await f.auth.createWaitlistCode({ name: "Share" }, f.ownerContext("horeka"));
      if (invitation.isErr() || code.isErr()) throw new Error("Expected shareable resources");
      const inviteLink = await f.auth.createOrganizationInvitationLink(
        { id: invitation.value.invitation.id },
        f.ownerContext("radar")
      );
      const codeLink = await f.auth.createWaitlistLink(
        { id: code.value.id },
        f.ownerContext("horeka")
      );
      expect(inviteLink.isOk() && new URL(inviteLink.value.url).origin).toBe(
        "https://radar.example.test"
      );
      if (codeLink.isErr()) throw codeLink.error;
      const shared = new URL(codeLink.value.url);
      expect(shared.origin).toBe("https://horeka.example.test");
      expect(shared.searchParams.get("experienceFlow")).toMatch(/\S+\.\S+/);
      expect(
        (
          await f.auth.createWaitlistLink(
            { id: code.value.id },
            {
              ...f.ownerContext("horeka"),
              actor: createServiceActor({ userId: "other", userRole: "user" }),
            }
          )
        ).isErr()
      ).toBe(true);
      await f.auth.cancelOrganizationInvitation(
        { invitationId: invitation.value.invitation.id },
        f.ownerContext("radar")
      );
      expect(
        (
          await f.auth.createOrganizationInvitationLink(
            { id: invitation.value.invitation.id },
            f.ownerContext("radar")
          )
        ).isErr()
      ).toBe(true);
    } finally {
      await f.close();
    }
  });

  it.each([false, true])(
    "completes invited social signup on its bound shared API (no Origin: %s)",
    async (noOrigin) => {
      const f = await fixture({ sharedApi: true, socialEmail: "social-invite@example.test" });
      const tokenBodies: URLSearchParams[] = [];
      const transport = jest.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
        if (String(url) !== "https://oauth2.googleapis.com/token")
          throw new Error(`Unexpected external request ${url}`);
        tokenBodies.push(new URLSearchParams(String(options?.body)));
        return new Response(
          JSON.stringify({
            access_token: "recorded",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid email profile",
          }),
          { headers: { "content-type": "application/json" } }
        );
      });
      try {
        const issued = await f.auth.inviteOrganizationMember(
          { email: "social-invite@example.test", role: "member" },
          f.ownerContext("horeka")
        );
        if (issued.isErr()) throw issued.error;
        const mail = await f.email.findLatestStoredEmail({ to: "social-invite@example.test" });
        const proof = new URL(String(mail?.props.url)).searchParams.get("experienceFlow")!;
        const start = await f.betterAuth.handler(
          new Request("https://api.example.test/api/auth/sign-in/social", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "api.example.test",
              origin: "https://horeka.example.test",
            },
            body: JSON.stringify({
              provider: "google",
              requestSignUp: true,
              callbackURL: "https://horeka.example.test/complete",
              additionalData: {
                organizationInvitationCode: issued.value.invitation.id,
                experienceFlow: proof,
                experienceId: "radar",
              },
            }),
          })
        );
        expect(start.status).toBe(200);
        const provider = new URL((await start.json()).url);
        const cookie = start.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
        const response = await f.betterAuth.handler(
          new Request(
            `https://api.example.test/api/auth/callback/google?${new URLSearchParams({ state: provider.searchParams.get("state")!, code: "recorded-code" })}`,
            {
              headers: {
                host: "api.example.test",
                cookie,
                ...(!noOrigin ? { origin: "https://horeka.example.test" } : {}),
              },
            }
          )
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("https://horeka.example.test/complete");
        const sessionCookies = response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
        const session = await f.betterAuth.api.getSession({
          headers: new Headers({
            host: "api.example.test",
            origin: "https://horeka.example.test",
            cookie: sessionCookies,
          }),
        });
        expect(session?.user.email).toBe("social-invite@example.test");
        expect(session?.user.locale).toBe("en_GB");
        const members = await f.auth.listOrganizationMembers(undefined, f.ownerContext("horeka"));
        expect(
          members.isOk() && members.value.find((row) => row.id === issued.value.member.id)?.userId
        ).toBe(session?.user.id);
        expect(tokenBodies).toHaveLength(1);
        expect(tokenBodies[0].get("redirect_uri")).toBe(
          "https://api.example.test/api/auth/callback/google"
        );
        expect(tokenBodies[0].get("code_verifier")).toMatch(/\S+/);
      } finally {
        transport.mockRestore();
        await f.close();
      }
    }
  );

  it("admits only pre-cutover raw resources under an explicit bounded legacy policy and refuses a rotated waitlist code", async () => {
    const issuedBefore = new Date(Date.now() - 60_000);
    const f = await fixture({
      legacyPolicy: {
        experience: "radar",
        issuedBefore,
        acceptUntil: new Date(Date.now() + 60_000),
      },
    });
    try {
      const invitation = await f.auth.inviteOrganizationMember(
        { email: "old@example.test", role: "member" },
        f.ownerContext("radar")
      );
      if (invitation.isErr()) throw invitation.error;
      await f.orm
        .update(schema.invitations)
        .set({ createdAt: new Date(issuedBefore.getTime() - 1000) })
        .where(eq(schema.invitations.id, invitation.value.invitation.id));
      const pub = (id: string) => ({ experience: f.registry.get(id), actor: null, user: null });
      expect(
        (await f.auth.readInvitation({ id: invitation.value.invitation.id }, pub("radar"))).isOk()
      ).toBe(true);
      expect(
        (await f.auth.readInvitation({ id: invitation.value.invitation.id }, pub("horeka"))).isErr()
      ).toBe(true);
      const [oldCode] = await f.orm
        .insert(schema.waitlist)
        .values({
          code: "old-code",
          email: "old-code@example.test",
          userId: "owner",
          status: "INVITED",
          createdAt: new Date(issuedBefore.getTime() - 1000),
          expiresAt: new Date(Date.now() + 600_000),
        })
        .returning();
      const old = await f.auth.validateWaitlistCode({ code: "old-code" }, pub("radar"));
      expect(old.isOk() && old.value.status).toBe("VALID");
      const admin = {
        ...f.ownerContext("radar"),
        actor: createServiceActor({ userId: "owner", userRole: "admin" }),
      };
      const rotated = await f.auth.inviteFromWaitlist({ id: oldCode.id }, admin);
      if (rotated.isErr()) throw rotated.error;
      const mail = await f.email.findLatestStoredEmail({ to: "old-code@example.test" });
      const link = new URL(String(mail?.props.url));
      expect(
        (
          await f.auth.validateWaitlistCode({ code: link.searchParams.get("code")! }, pub("radar"))
        ).isErr()
      ).toBe(true);
      const signed = await f.auth.validateWaitlistCode(
        {
          code: link.searchParams.get("code")!,
          experienceFlow: link.searchParams.get("experienceFlow")!,
        },
        pub("radar")
      );
      expect(signed.isOk() && signed.value.status).toBe("VALID");
      expect(
        (
          await f.auth.readInvitation(
            { id: invitation.value.invitation.id, experienceFlow: "invalid" },
            pub("radar")
          )
        ).isErr()
      ).toBe(true);
      const signup = (proof?: string) =>
        f.betterAuth.api.signUpEmail({
          headers: new Headers({
            host: "radar.example.test",
            origin: "https://radar.example.test",
            "organization-invitation-code": invitation.value.invitation.id,
            ...(proof !== undefined ? { "X-M5kdev-Experience-Flow": proof } : {}),
          }),
          body: {
            name: "Legacy invited User",
            email: "old@example.test",
            password: "Legacy-Password-123",
          },
        });
      await expect(signup("")).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect((await signup()).user.email).toBe("old@example.test");
    } finally {
      await f.close();
    }
  });

  it("keeps raw outstanding invitations and waitlist codes valid in the single-Experience shorthand", async () => {
    const f = await fixture({ legacy: true });
    try {
      const invitation = await f.auth.inviteOrganizationMember(
        { email: "legacy@example.test", role: "member" },
        f.ownerContext("radar")
      );
      if (invitation.isErr()) throw invitation.error;
      const mail = await f.email.findLatestStoredEmail({ to: "legacy@example.test" });
      expect(new URL(String(mail?.props.url)).searchParams.has("experienceFlow")).toBe(false);
      expect(
        (
          await f.auth.readInvitation(
            { id: invitation.value.invitation.id },
            { user: null, actor: null }
          )
        ).isOk()
      ).toBe(true);
      const code = await f.auth.inviteToWaitlist(
        { email: "legacy-friend@example.test" },
        f.ownerContext("radar")
      );
      if (code.isErr()) throw code.error;
      const raw = await f.auth.validateWaitlistCode(
        { code: code.value.code! },
        { user: null, actor: null }
      );
      expect(raw.isOk() && raw.value.status).toBe("VALID");
    } finally {
      await f.close();
    }
  });

  it("refuses old claim magic links after email changes instead of authenticating a different User at the recycled email", async () => {
    const f = await fixture();
    const transport = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) =>
        f.betterAuth.handler(new Request(String(url), options))
      );
    try {
      const [user] = await f.orm
        .insert(schema.users)
        .values({
          id: "claim-owner",
          email: "placeholder@example.test",
          name: "Owner",
          emailVerified: false,
          role: "user",
        })
        .returning();
      const admin = {
        ...f.ownerContext("radar"),
        actor: createServiceActor({ userId: "owner", userRole: "admin" }),
      };
      const claim = await f.auth.createAccountClaimCode({ userId: user.id }, admin);
      if (claim.isErr()) throw claim.error;
      const old = await f.auth.generateAccountClaimMagicLink(
        { claimId: claim.value.id, email: "original-claim@example.test" },
        admin
      );
      if (old.isErr()) throw old.error;
      const callback = new URL(new URL(old.value.url).searchParams.get("callbackURL")!);
      const context = {
        experience: f.registry.get("radar"),
        user,
        actor: createServiceActor({ userId: user.id, userRole: "user" }),
      };
      expect(
        (
          await f.auth.setMyAccountClaimEmail(
            {
              claimId: claim.value.id,
              experienceFlow: callback.searchParams.get("claimFlow")!,
              email: "changed-claim@example.test",
            },
            context
          )
        ).isOk()
      ).toBe(true);
      await f.orm.insert(schema.users).values({
        id: "different-person",
        email: "original-claim@example.test",
        name: "Different",
        emailVerified: true,
        role: "user",
      });
      const oldResponse = await f.betterAuth.handler(
        new Request(old.value.url, { headers: { host: "radar.example.test" } })
      );
      expect(oldResponse.status).toBe(400);
      expect(oldResponse.headers.get("set-cookie") ?? "").not.toContain("session_token");
      const fresh = await f.auth.generateAccountClaimMagicLink({ claimId: claim.value.id }, admin);
      if (fresh.isErr()) throw fresh.error;
      expect(fresh.value.id).not.toBe(old.value.id);
      const signedIn = await f.betterAuth.handler(
        new Request(fresh.value.url, { headers: { host: "radar.example.test" } })
      );
      expect(signedIn.status).toBe(302);
      const cookie = signedIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const session = await f.betterAuth.api.getSession({
        headers: new Headers({ host: "radar.example.test", cookie }),
      });
      expect(session?.user.id).toBe(user.id);
      expect(session?.user.email).toBe("changed-claim@example.test");
    } finally {
      transport.mockRestore();
      await f.close();
    }
  });

  it("rejects revoked and expired invitation and waitlist resources even with previously valid proofs", async () => {
    const f = await fixture();
    try {
      const context = f.ownerContext("radar");
      const pub = { experience: context.experience, user: null, actor: null };
      const issued = await f.auth.inviteOrganizationMember(
        { email: "revoked@example.test", role: "member" },
        context
      );
      if (issued.isErr()) throw issued.error;
      const email = await f.email.findLatestStoredEmail({ to: "revoked@example.test" });
      const proof = new URL(String(email?.props.url)).searchParams.get("experienceFlow")!;
      const input = { id: issued.value.invitation.id, experienceFlow: proof };
      await f.auth.cancelOrganizationInvitation({ invitationId: input.id }, context);
      expect((await f.auth.readInvitation(input, pub)).isErr()).toBe(true);
      const expired = await f.auth.inviteOrganizationMember(
        { email: "expired@example.test", role: "member" },
        context
      );
      if (expired.isErr()) throw expired.error;
      await f.orm
        .update(schema.invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.invitations.id, expired.value.invitation.id));
      expect((await f.auth.readInvitation({ id: expired.value.invitation.id }, pub)).isErr()).toBe(
        true
      );
      const code = await f.auth.createWaitlistCode({}, context);
      if (code.isErr()) throw code.error;
      const share = await f.auth.createWaitlistLink({ id: code.value.id }, context);
      if (share.isErr()) throw share.error;
      const params = new URL(share.value.url).searchParams;
      const codeInput = {
        code: params.get("code")!,
        experienceFlow: params.get("experienceFlow")!,
      };
      await f.orm
        .update(schema.waitlist)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.waitlist.id, code.value.id));
      const expiredCode = await f.auth.validateWaitlistCode(codeInput, pub);
      expect(expiredCode.isOk() && expiredCode.value.status).toBe("EXPIRED");
      const admin = {
        ...context,
        actor: createServiceActor({ userId: "owner", userRole: "admin" }),
      };
      await f.auth.removeFromWaitlist({ id: code.value.id }, admin);
      await f.orm
        .update(schema.waitlist)
        .set({ expiresAt: new Date(Date.now() + 60_000) })
        .where(eq(schema.waitlist.id, code.value.id));
      const revokedCode = await f.auth.validateWaitlistCode(codeInput, pub);
      expect(revokedCode.isOk() && revokedCode.value.status).toBe("INVALID");
    } finally {
      await f.close();
    }
  });

  it.each(["expired", "revoked"])(
    "denies a %s claim before the magic token can create a session",
    async (state) => {
      const f = await fixture();
      const transport = jest
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, options) =>
          f.betterAuth.handler(new Request(String(url), options))
        );
      try {
        await f.orm.insert(schema.users).values({
          id: "stale-claim",
          email: "stale@example.test",
          name: "Stale",
          emailVerified: false,
          role: "user",
        });
        const admin = {
          ...f.ownerContext("radar"),
          actor: createServiceActor({ userId: "owner", userRole: "admin" }),
        };
        const claim = await f.auth.createAccountClaimCode({ userId: "stale-claim" }, admin);
        if (claim.isErr()) throw claim.error;
        const link = await f.auth.generateAccountClaimMagicLink(
          { claimId: claim.value.id, email: "stale-real@example.test" },
          admin
        );
        if (link.isErr()) throw link.error;
        await f.orm
          .update(schema.accountClaims)
          .set(
            state === "expired" ? { expiresAt: new Date(Date.now() - 1000) } : { status: "REVOKED" }
          )
          .where(eq(schema.accountClaims.id, claim.value.id));
        const response = await f.betterAuth.handler(
          new Request(link.value.url, { headers: { host: "radar.example.test" } })
        );
        expect(response.status).toBe(400);
        expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
      } finally {
        transport.mockRestore();
        await f.close();
      }
    }
  );

  it("does not admit an old raw invitation after the explicit legacy acceptance deadline", async () => {
    const issuedBefore = new Date(Date.now() - 120_000);
    const f = await fixture({
      legacyPolicy: {
        experience: "radar",
        issuedBefore,
        acceptUntil: new Date(Date.now() - 60_000),
      },
    });
    try {
      const invite = await f.auth.inviteOrganizationMember(
        { email: "deadline@example.test", role: "member" },
        f.ownerContext("radar")
      );
      if (invite.isErr()) throw invite.error;
      await f.orm
        .update(schema.invitations)
        .set({ createdAt: new Date(issuedBefore.getTime() - 1000) })
        .where(eq(schema.invitations.id, invite.value.invitation.id));
      expect(
        (
          await f.auth.readInvitation(
            { id: invite.value.invitation.id },
            { experience: f.registry.get("radar"), user: null, actor: null }
          )
        ).isErr()
      ).toBe(true);
    } finally {
      await f.close();
    }
  });

  it("uses explicit request presentation for both waitlist confirmations and profile-specific system notifications", async () => {
    const f = await fixture();
    try {
      for (const id of ["radar", "horeka"]) {
        const joined = await f.auth.joinWaitlist(
          { email: `${id}-join@example.test` },
          { experience: f.registry.get(id), user: null, actor: null }
        );
        expect(joined.isOk()).toBe(true);
        const confirmation = await f.email.findLatestStoredEmail({ to: `${id}-join@example.test` });
        const system = await f.email.findLatestStoredEmail({ to: `ops-${id}@example.test` });
        expect(confirmation?.props.brand).toEqual(f.registry.get(id).brand);
        expect(system?.props.brand).toEqual(f.registry.get(id).brand);
        expect(system?.from).toBe(confirmation?.from);
        expect(system?.props.url).toBe(`https://${id}.example.test/admin/waitlist`);
      }
    } finally {
      await f.close();
    }
  });
  it("fails direct branded issuance before creating Membership when flow signing was omitted from composition", async () => {
    const f = await fixture();
    try {
      const direct = new AuthService(
        f.built.modules.auth.repositories as never,
        { email: f.email },
        defaultAuthGrants,
        f.built.serverEvents,
        f.built.config.app.urls,
        undefined,
        f.built.config.app.locales,
        f.built.config.i18n,
        f.built.config.app.roles,
        30,
        { registry: f.registry }
      );
      const issued = await direct.inviteOrganizationMember(
        { email: "missing-signer@example.test", role: "member" },
        f.ownerContext("radar")
      );
      expect(issued.isErr()).toBe(true);
      const members = await f.auth.listOrganizationMembers(undefined, f.ownerContext("radar"));
      expect(members.isOk() && members.value.map((row) => row.id)).toEqual(["owner-member"]);
    } finally {
      await f.close();
    }
  });
  it("keeps a custom local acceptance query and fragment while setting exactly one authoritative invitation id", async () => {
    const f = await fixture();
    try {
      const invitation = await f.auth.inviteOrganizationMember(
        { email: "custom@example.test", role: "member" },
        f.ownerContext("radar")
      );
      if (invitation.isErr()) throw invitation.error;
      const shared = await f.auth.createOrganizationInvitationLink(
        { id: invitation.value.invitation.id, path: "/custom-accept?mode=join&id=wrong#section" },
        f.ownerContext("radar")
      );
      if (shared.isErr()) throw shared.error;
      const link = new URL(shared.value.url);
      expect(link.origin).toBe("https://radar.example.test");
      expect(link.pathname).toBe("/custom-accept");
      expect(link.searchParams.getAll("id")).toEqual([invitation.value.invitation.id]);
      expect(link.searchParams.get("mode")).toBe("join");
      expect(link.hash).toBe("#section");
      expect(
        (
          await f.auth.readInvitation(
            {
              id: invitation.value.invitation.id,
              experienceFlow: link.searchParams.get("experienceFlow")!,
            },
            { experience: f.registry.get("radar"), user: null, actor: null }
          )
        ).isOk()
      ).toBe(true);
      expect(
        (
          await f.auth.createOrganizationInvitationLink(
            {
              id: invitation.value.invitation.id,
              path: "https://horeka.example.test/custom-accept",
            },
            f.ownerContext("radar")
          )
        ).isErr()
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("requires the original claim reference in strict mode even when multiple old claims are eligible for legacy admission", async () => {
    const issuedBefore = new Date(Date.now() - 60_000);
    const f = await fixture({
      legacyPolicy: {
        experience: "radar",
        issuedBefore,
        acceptUntil: new Date(Date.now() + 60_000),
      },
    });
    try {
      const [user] = await f.orm
        .insert(schema.users)
        .values({
          id: "old-claims-owner",
          name: "Old claims",
          email: "old-claims@example.test",
          emailVerified: true,
          role: "user",
        })
        .returning();
      const admin = {
        ...f.ownerContext("radar"),
        actor: createServiceActor({ userId: "owner", userRole: "admin" }),
      };
      const first = await f.auth.createAccountClaimCode({ userId: user.id }, admin);
      const second = await f.auth.createAccountClaimCode({ userId: user.id }, admin);
      if (first.isErr() || second.isErr()) throw new Error("Expected old pending claims");
      await f.orm
        .update(schema.accountClaims)
        .set({ createdAt: new Date(issuedBefore.getTime() - 1000) })
        .where(eq(schema.accountClaims.claimUserId, user.id));
      const context = {
        user,
        actor: createServiceActor({ userId: user.id, userRole: "user" }),
        experience: f.registry.get("radar"),
      };
      expect((await f.auth.getMyAccountClaimStatus(undefined, context)).isErr()).toBe(true);
      expect((await f.auth.acceptMyAccountClaim(undefined, context)).isErr()).toBe(true);
      const exact = await f.auth.getMyAccountClaimStatus({ claimId: first.value.id }, context);
      expect(exact.isOk() && exact.value?.id).toBe(first.value.id);
      expect((await f.auth.acceptMyAccountClaim({ claimId: first.value.id }, context)).isOk()).toBe(
        true
      );
      const claims = await f.auth.listAccountClaims(undefined, admin);
      expect(
        claims.isOk() && claims.value.find((claim) => claim.id === second.value.id)?.status
      ).toBe("INVITED");
    } finally {
      await f.close();
    }
  });
  it("keeps owned raw code creation presentation-neutral and requires context only when issuing its share link", async () => {
    const f = await fixture();
    try {
      const neutral = { ...f.ownerContext("radar"), experience: undefined };
      const code = await f.auth.createWaitlistCode({ name: "API-created code" }, neutral);
      expect(code.isOk()).toBe(true);
      if (code.isErr()) throw code.error;
      expect((await f.auth.createWaitlistLink({ id: code.value.id }, neutral)).isErr()).toBe(true);
      const link = await f.auth.createWaitlistLink({ id: code.value.id }, f.ownerContext("horeka"));
      expect(link.isOk() && new URL(link.value.url).origin).toBe("https://horeka.example.test");
    } finally {
      await f.close();
    }
  });

  it("admits an actually issued old raw claim magic link once during strict adoption and rejects newer unsigned issuance", async () => {
    const f = await fixture({ legacy: true });
    const transport = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) =>
        f.betterAuth.handler(new Request(String(url), options))
      );
    try {
      await f.orm.insert(schema.users).values({
        id: "legacy-claim-user",
        name: "Legacy Claim",
        email: "legacy-placeholder@example.test",
        emailVerified: false,
        role: "user",
      });
      const admin = {
        ...f.ownerContext("radar"),
        actor: createServiceActor({ userId: "owner", userRole: "admin" }),
      };
      const claim = await f.auth.createAccountClaimCode({ userId: "legacy-claim-user" }, admin);
      if (claim.isErr()) throw claim.error;
      const old = await f.auth.generateAccountClaimMagicLink(
        { claimId: claim.value.id, email: "legacy-real@example.test" },
        admin
      );
      if (old.isErr()) throw old.error;
      expect(
        new URL(new URL(old.value.url).searchParams.get("callbackURL")!).searchParams.has(
          "experienceFlow"
        )
      ).toBe(false);
      const issuedBefore = new Date(Date.now() + 1000);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const registry = new ExperienceRegistry(experienceConfig);
      const strict = createBetterAuth({
        orm: f.orm,
        schema,
        services: { email: f.email },
        app: { ...f.built.config.app, experienceRegistry: registry },
        experienceFlows: new ExperienceFlowSigner(registry, SECRET, {
          legacyPolicy: {
            experience: "radar",
            issuedBefore,
            acceptUntil: new Date(Date.now() + 60_000),
          },
        }),
        options: { secret: SECRET, rateLimit: { enabled: false } },
      });
      const request = (url: string) =>
        new Request(url, { headers: { host: "radar.example.test" } });
      const accepted = await strict.handler(request(old.value.url));
      expect(accepted.status).toBe(302);
      expect(new URL(accepted.headers.get("location")!).origin).toBe("https://radar.example.test");
      expect(accepted.headers.getSetCookie().join(";")).toContain("session_token");
      expect((await strict.handler(request(old.value.url))).status).toBe(400);
      const fresh = await f.auth.generateAccountClaimMagicLink({ claimId: claim.value.id }, admin);
      if (fresh.isErr()) throw fresh.error;
      const rejected = await strict.handler(request(fresh.value.url));
      expect(rejected.status).toBe(400);
      expect(rejected.headers.get("set-cookie") ?? "").not.toContain("session_token");
      expect((await f.betterAuth.handler(request(fresh.value.url))).status).toBe(302);
    } finally {
      transport.mockRestore();
      await f.close();
    }
  });

  it.each(["split", "shared"])(
    "validates signed service continuations against the actual HTTP API pair (%s topology)",
    async (topology) => {
      const f = await fixture(topology === "split" ? { splitApi: true } : { sharedApi: true });
      let server: Server | undefined;
      try {
        const [user] = await f.orm
          .insert(schema.users)
          .values({
            id: "http-user",
            name: "HTTP User",
            email: "http-user@example.test",
            emailVerified: true,
            role: "user",
          })
          .returning();
        const issued = await f.auth.inviteOrganizationMember(
          { email: user.email, role: "member" },
          f.ownerContext("radar")
        );
        if (issued.isErr()) throw issued.error;
        const mail = await f.email.findLatestStoredEmail({ to: user.email });
        const invitationInput = {
          id: issued.value.invitation.id,
          experienceFlow: new URL(String(mail?.props.url)).searchParams.get("experienceFlow")!,
        };
        const code = await f.auth.createWaitlistCode(
          {},
          { ...f.ownerContext("radar"), experience: undefined }
        );
        if (code.isErr()) throw code.error;
        const share = await f.auth.createWaitlistLink(
          { id: code.value.id },
          f.ownerContext("radar")
        );
        if (share.isErr()) throw share.error;
        const codeParams = new URL(share.value.url).searchParams;
        const waitlistInput = {
          code: codeParams.get("code")!,
          experienceFlow: codeParams.get("experienceFlow")!,
        };
        const admin = {
          ...f.ownerContext("radar"),
          actor: createServiceActor({ userId: "owner", userRole: "admin" }),
        };
        const claim = await f.auth.createAccountClaimCode({ userId: user.id }, admin);
        if (claim.isErr()) throw claim.error;
        const experience = f.registry.get("radar");
        const claimProof = new ExperienceFlowSigner(f.registry, SECRET).sign({
          purpose: "account-claim",
          token: JSON.stringify([claim.value.id, user.id]),
          experience,
          destination: f.registry.destination(
            experience,
            `/claim-account?${new URLSearchParams({ claim: claim.value.id })}`
          ),
          expiresAt: claim.value.expiresAt!.getTime(),
        });
        const claimInput = { claimId: claim.value.id, experienceFlow: claimProof };
        const seen: Array<string | undefined> = [];
        f.built.express.app.post("/bound/:operation", async (req, res) => {
          seen.push((req as ExperienceRequest).experience?.id);
          const ctx = {
            user,
            actor: createServiceActor({ userId: user.id, userRole: "user" }),
            req,
            experience: (req as ExperienceRequest).experience,
          };
          const response =
            req.params.operation === "read"
              ? await f.auth.readInvitation(req.body, ctx)
              : req.params.operation === "waitlist"
                ? await f.auth.validateWaitlistCode(req.body, ctx)
                : req.params.operation === "claim"
                  ? await f.auth.getMyAccountClaimStatus(req.body, ctx)
                  : req.params.operation === "claim-email"
                    ? await f.auth.setMyAccountClaimEmail(req.body, ctx)
                    : await f.auth.acceptOrganizationInvitation(req.body, ctx);
          res
            .status(response.isErr() ? 400 : 200)
            .json(response.isErr() ? { message: response.error.message } : response.value);
        });
        server = await new Promise<Server>((resolve) => {
          const listening = f.built.express.app.listen(0, "127.0.0.1", () => resolve(listening));
        });
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const post = (host: string, operation: string, input: unknown) =>
          new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
            const request = httpRequest(
              `${base}/bound/${operation}`,
              { method: "POST", headers: { host, "content-type": "application/json" } },
              (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk) => chunks.push(chunk));
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    data: JSON.parse(Buffer.concat(chunks).toString()),
                  })
                );
              }
            );
            request.on("error", reject);
            request.end(JSON.stringify(input));
          });
        if (topology === "split") {
          expect((await post("bc-api.example.test", "accept", invitationInput)).status).toBe(400);
          expect((await post("bc-api.example.test", "read", invitationInput)).status).toBe(400);
          expect((await post("bc-api.example.test", "waitlist", waitlistInput)).status).toBe(400);
          expect((await post("bc-api.example.test", "claim", claimInput)).status).toBe(400);
          expect(
            (
              await post("bc-api.example.test", "claim-email", {
                ...claimInput,
                email: "wrong-pair@example.test",
              })
            ).status
          ).toBe(400);
          expect(seen.every((value) => value === undefined)).toBe(true);
          const members = await f.auth.listOrganizationMembers(undefined, f.ownerContext("radar"));
          expect(
            members.isOk() && members.value.find((row) => row.id === issued.value.member.id)?.userId
          ).toBeNull();
        }
        const host = topology === "split" ? "a-api.example.test" : "api.example.test";
        expect((await post(host, "read", invitationInput)).status).toBe(200);
        expect((await post(host, "waitlist", waitlistInput)).data.status).toBe("VALID");
        const status = await post(host, "claim", claimInput);
        expect(status.status).toBe(200);
        expect(status.data.id).toBe(claim.value.id);
        expect(status.data.claimedEmail).toBeNull();
        const accepted = await post(host, "accept", invitationInput);
        expect(accepted.status).toBe(200);
        expect(accepted.data.memberId).toBe(issued.value.member.id);
        if (topology === "shared") expect(seen.every((value) => value === undefined)).toBe(true);
      } finally {
        if (server)
          await new Promise<void>((resolve, reject) =>
            server!.close((error) => (error ? reject(error) : resolve()))
          );
        await f.close();
      }
    }
  );
});
