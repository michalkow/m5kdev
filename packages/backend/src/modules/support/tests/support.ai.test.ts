import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { createServiceActor } from "../../../base/base.actor";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { users } from "../../auth/auth.db";
import { taggings, tags } from "../../tag/tag.db";
import * as tables from "../support.db";
import { SupportRepository } from "../support.repository";
import { SupportService } from "../support.service";

const ctx = (userId: string, userRole = "user") => ({
  actor: createServiceActor({ userId, userRole }),
});
it("answers from applicable released docs and suppresses an answer after a human request", async () => {
  const pool = createTestPool();
  const schema = { users, tags, taggings, ...tables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(users).values([
    { id: "user", name: "User", email: "user@local.test", emailVerified: true },
    { id: "staff", name: "Staff", email: "staff@local.test", emailVerified: true, role: "admin" },
  ]);
  let release: (value: { supported: boolean; text: string; citations: string[] }) => void =
    () => {};
  let entered: () => void = () => {};
  let gate = false;
  let suppliedHistory: string[] = [];
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    {},
    undefined,
    {
      locales: ["en"],
      documentation: { applicationVersion: "local-v1", allowedOrigins: ["https://help.local"] },
      assistant: {
        id: "local-grounded",
        answer: async ({ sources, history }) => {
          suppliedHistory = history.map((message) => message.content);
          if (gate) {
            entered();
            return new Promise((resolve) => {
              release = resolve;
            });
          }
          return {
            supported: true,
            text: "Open Settings and choose Reset password.",
            citations: [sources[0].url],
          };
        },
      },
    }
  );
  try {
    const text = "To reset a password, open Settings and choose Reset password.";
    const staged = await support.stageDocumentation(
      {
        manifest: {
          schemaVersion: 1,
          version: "release-1",
          applicationVersion: "local-v1",
          generatedAt: new Date().toISOString(),
          entries: [
            {
              id: "password",
              locale: "en",
              experience: "default",
              url: "https://help.local/password/",
              title: "Reset password",
              text,
              sha256: createHash("sha256").update(text).digest("hex"),
            },
          ],
        },
      },
      ctx("staff", "admin")
    );
    if (staged.isErr()) throw staged.error;
    const indexed = await support.processDocumentation();
    if (indexed.isErr()) throw indexed.error;
    const settings = await support.saveSettings(
      {
        expectedVersion: 0,
        nativeLocales: ["en"],
        fallbackLocale: "en",
        translation: { enabled: false },
        ai: {
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
      },
      ctx("staff", "admin")
    );
    if (settings.isErr()) throw settings.error;
    const created = await support.createCase(
      { clientId: "ai", subject: "Password", body: "How do I reset a password?" },
      ctx("user")
    );
    if (created.isErr()) throw created.error;
    await support.processWork();
    const view = await support.getCase({ id: created.value.id }, ctx("user"));
    if (view.isErr()) throw view.error;
    expect(view.value.messages[1].authorKind).toBe("ai");
    expect(view.value.messages[1].citations).toEqual(["https://help.local/password/"]);
    expect(view.value.case.status).toBe("open");
    const invalid = await support.stageDocumentation(
      {
        manifest: {
          schemaVersion: 1,
          version: "bad-release",
          applicationVersion: "local-v1",
          generatedAt: new Date().toISOString(),
          entries: [
            {
              id: "bad",
              locale: "en",
              experience: "default",
              url: "https://help.local/password/",
              title: "Bad",
              text: "Changed",
              sha256: "0".repeat(64),
            },
          ],
        },
      },
      ctx("staff", "admin")
    );
    if (invalid.isErr()) throw invalid.error;
    await support.processDocumentation();
    const versions = await support.getDocumentation({}, ctx("staff", "admin"));
    if (versions.isErr()) throw versions.error;
    expect(versions.value.find((version) => version.version === "release-1")?.state).toBe("active");
    expect(versions.value.find((version) => version.version === "bad-release")?.state).toBe(
      "failed"
    );
    gate = true;
    const redactionStarted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const redactionQuestion = await support.sendMessage(
      { id: created.value.id, clientId: "before-redaction", body: "Reset password" },
      ctx("user")
    );
    if (redactionQuestion.isErr()) throw redactionQuestion.error;
    const redactionWork = support.processWork();
    await redactionStarted;
    expect(suppliedHistory).toContain("How do I reset a password?");
    const redacted = await support.redactMessage(
      { id: created.value.id, messageId: view.value.messages[0].id, reason: "Private old context" },
      ctx("staff", "admin")
    );
    if (redacted.isErr()) throw redacted.error;
    release({
      supported: true,
      text: "Repeats redacted context",
      citations: ["https://help.local/password/"],
    });
    await redactionWork;
    const redactedView = await support.getCase({ id: created.value.id }, ctx("user"));
    if (redactedView.isErr()) throw redactedView.error;
    expect(redactedView.value.messages.map((message) => message.body)).not.toContain(
      "Repeats redacted context"
    );
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const followup = await support.sendMessage(
      { id: created.value.id, clientId: "follow-up", body: "Reset password again" },
      ctx("user")
    );
    if (followup.isErr()) throw followup.error;
    const running = support.processWork();
    await started;
    const handoff = await support.requestHuman({ id: created.value.id }, ctx("user"));
    if (handoff.isErr()) throw handoff.error;
    release({ supported: true, text: "Stale answer", citations: ["https://help.local/password/"] });
    await running;
    const final = await support.getCase({ id: created.value.id }, ctx("user"));
    if (final.isErr()) throw final.error;
    expect(final.value.case.handling).toBe("human");
    expect(final.value.messages.map((message) => message.body)).not.toContain("Stale answer");
    await support.withdrawDocumentation({ version: "release-1" }, ctx("staff", "admin"));
    const unsupported = await support.createCase(
      { clientId: "withdrawn", subject: "No docs", body: "Reset password" },
      ctx("user")
    );
    if (unsupported.isErr()) throw unsupported.error;
    await support.processWork();
    const handedOff = await support.getCase({ id: unsupported.value.id }, ctx("user"));
    if (handedOff.isErr()) throw handedOff.error;
    expect(handedOff.value.case.handling).toBe("human");
    expect(handedOff.value.messages).toHaveLength(1);
  } finally {
    await pool.end();
  }
});
