import { createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createBackendApp } from "../app";
import { createServiceActor } from "../base/base.actor";
import * as auth from "../modules/auth/auth.db";
import { createBetterAuth } from "../modules/auth/auth.lib";
import { AuthModule } from "../modules/auth/auth.module";
import { EmailModule } from "../modules/email/email.module";
import * as files from "../modules/file/file.db";
import { FileModule } from "../modules/file/file.module";
import * as support from "../modules/support/support.db";
import { SupportModule } from "../modules/support/support.module";
import * as tag from "../modules/tag/tag.db";
import { TagModule } from "../modules/tag/tag.module";
import { workflows } from "../modules/workflow/workflow.db";
import { WorkflowModule } from "../modules/workflow/workflow.module";

async function main() {
  if (process.env.APP_ENV !== "local" || process.env.DATABASE_SCHEMA !== "app")
    throw new Error(
      "Run only with APP_ENV=local and DATABASE_SCHEMA=app on migrated disposable storage"
    );
  const databaseUrl = process.env.SUPPORT_VERIFICATION_DATABASE_URL;
  const redisUrl = process.env.SUPPORT_VERIFICATION_REDIS_URL;
  for (const value of [databaseUrl, redisUrl]) {
    if (!value || !["127.0.0.1", "localhost"].includes(new URL(value).hostname))
      throw new Error(
        "Verification requires explicitly selected loopback PostgreSQL and Redis URLs"
      );
  }
  if (!databaseUrl || !redisUrl) throw new Error("Missing local storage URLs");
  if (!new URL(databaseUrl).pathname.startsWith("/support_"))
    throw new Error("Use a disposable support_ database");
  const base = "http://127.0.0.1:43191";
  const schema = { ...auth, ...files, ...support, ...tag, workflows };
  const template = { id: "local", react: () => null };
  const app = createBackendApp(
    {
      db: { connectionString: databaseUrl },
      schema,
      app: { name: "Support verification", urls: { web: base, api: base } },
      redis: { url: redisUrl, options: { maxRetriesPerRequest: null } },
      email: {
        mode: "store",
        from: "local@fixture.test",
        systemNotificationEmail: "local@fixture.test",
        outputDirectory: "/tmp/m5kdev-support-execution/emails",
      },
      spa: { root: "../../apps/starter/webapp/dist" },
      auth: {
        factory: ({ db, services, appConfig }) =>
          createBetterAuth({
            orm: db.orm,
            schema,
            services: { email: services.email.email },
            app: appConfig,
            options: {
              secret: "support-verification-secret-longer-than-32-characters",
              rateLimit: { enabled: false },
            },
          }),
      },
    },
    [
      new EmailModule({
        accountDeletion: template,
        verification: template,
        passwordReset: template,
        organizationInvite: template,
      }),
      new AuthModule(),
      new FileModule(),
      new TagModule(),
      new WorkflowModule({
        queues: { support: { concurrency: 2 } },
        defaultQueue: "support",
        schedulers: false,
        boardPath: null,
      }),
      new SupportModule({
        locales: ["en", "pl"],
        documentation: { applicationVersion: "fixture-v1", allowedOrigins: [base] },
        assistant: {
          id: "synthetic",
          answer: async ({ sources }) => ({
            supported: true,
            text: "Open Settings to reset your password.",
            citations: [sources[0].url],
          }),
        },
        translation: {
          id: "synthetic",
          languages: ["en", "pl"],
          detect: async ({ text }) => ({ locale: text.includes("Pytanie") ? "pl" : "en" }),
          translate: async ({ text, targetLocale }) => ({ text: `${targetLocale}: ${text}` }),
        },
      }),
    ]
  );
  const password = await hashPassword("Local-Support-Password-123");
  for (const [id, role] of [
    ["support-customer", "user"],
    ["support-staff", "admin"],
  ]) {
    await app.db.orm
      .insert(auth.users)
      .values({ id, name: id, email: `${id}@fixture.test`, emailVerified: true, role })
      .onConflictDoNothing();
    await app.db.orm
      .insert(auth.accounts)
      .values({
        id: `${id}-password`,
        accountId: id,
        userId: id,
        providerId: "credential",
        password,
      })
      .onConflictDoNothing();
  }
  await app.start();
  const svc = app.modules.support.services.support;
  const admin = { actor: createServiceActor({ userId: "support-staff", userRole: "admin" }) };
  const text = "To reset your password open Settings to reset your password.";
  const staged = await svc.stageDocumentation(
    {
      manifest: {
        schemaVersion: 1,
        version: "fixture-v1",
        applicationVersion: "fixture-v1",
        generatedAt: new Date().toISOString(),
        entries: [
          {
            id: "password",
            locale: "en",
            experience: "default",
            url: `${base}/documentation/password`,
            title: "Reset password",
            text,
            sha256: createHash("sha256").update(text).digest("hex"),
          },
        ],
      },
    },
    admin
  );
  if (staged.isErr()) throw staged.error;
  await svc.processDocumentation();
  const previous = await svc.getSettings({}, admin);
  if (previous.isErr()) throw previous.error;
  const budget = {
    monthlyCalls: 100,
    dailyUserCalls: 100,
    maxInputCharacters: 30000,
    maxOutputCharacters: 20000,
    concurrency: 2,
    attempts: 1,
    timeoutMs: 5000,
  };
  const settings = await svc.saveSettings(
    {
      expectedVersion: previous.value.version,
      nativeLocales: ["en"],
      fallbackLocale: "en",
      csatEnabled: true,
      translation: { enabled: true, budget },
      ai: { enabled: true, budget },
    },
    admin
  );
  if (settings.isErr()) throw settings.error;
  console.log("SUPPORT_RUNTIME_READY", base);
  // Keep the fixture bounded even when a browser check fails before requesting shutdown.
  setTimeout(
    async () => {
      await app.shutdown();
      process.exit(0);
    },
    10 * 60 * 1000
  ).unref();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, async () => {
      await app.shutdown();
      process.exit(0);
    });
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
