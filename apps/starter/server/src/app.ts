import { createBackendApp } from "@m5kdev/backend/app";
import { shutdownTelemetry } from "@m5kdev/backend/lib/otel";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { EmailPreviewModule } from "@m5kdev/backend/modules/email/email.preview.module";
// m5k:files:start
import { FileModule } from "@m5kdev/backend/modules/file/file.module";
// m5k:files:end
// m5k:notifications:start
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";
// m5k:notifications:end
// m5k:workflows:start
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
// m5k:workflows:end
import { templates } from "@starter-app/email";
import { emailResources } from "@starter-app/email/resources";
import {
  APP_LOCALE_CONFIG,
  APP_NAME,
  APP_ROLES_CONFIG,
} from "@starter-app/shared/modules/app/app.constants";
// m5k:workflows:start
import { DemoWorkflowModule } from "./modules/demo-workflow/demo-workflow.module";
// m5k:workflows:end
import { PostsModule } from "./modules/posts/posts.module";
// m5k:test-harness:start
import { TestHarnessModule } from "./modules/test-harness/test-harness.module";
// m5k:test-harness:end
import * as schema from "./schema";

const appUrl = process.env.VITE_APP_URL ?? "http://localhost:5173";
const serverUrl = process.env.VITE_SERVER_URL ?? "http://localhost:8080";
const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const syncUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
// m5k:workflows:start
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
// m5k:workflows:end
const resendApiKey = process.env.RESEND_API_KEY;
const enableWaitlist = process.env.VITE_ENABLE_WAITLIST === "true";

const connection =
  syncUrl && authToken
    ? {
        url: databaseUrl,
        syncUrl,
        authToken,
        syncInterval: 60,
        readYourWrites: true,
      }
    : {
        url: databaseUrl,
      };

export const builtBackendApp = createBackendApp(
  {
    db: connection,
    schema,
    onShutdown: shutdownTelemetry,
    app: {
      name: APP_NAME,
      urls: {
        web: appUrl,
        api: serverUrl,
      },
      locales: APP_LOCALE_CONFIG,
      roles: APP_ROLES_CONFIG,
    },
    i18n: {
      resources: emailResources,
    },
    spa: { root: "./client" },
    // m5k:workflows:start
    redis: {
      url: redisUrl,
      options: { maxRetriesPerRequest: null },
    },
    // m5k:workflows:end
    resend: resendApiKey ? { apiKey: resendApiKey } : undefined,
    email: {
      mode: resendApiKey ? "send" : "store",
      from: process.env.EMAIL_FROM ?? "no-reply@local.m5kdev.test",
      systemNotificationEmail: process.env.SYSTEM_NOTIFICATION_EMAIL ?? "ops@local.m5kdev.test",
      outputDirectory: process.env.EMAIL_OUTPUT_DIRECTORY ?? ".emails",
    },
    auth: {
      factory({ db, services, appConfig, i18n }) {
        return createBetterAuth({
          orm: db.orm,
          schema: db.schema,
          services: {
            email: services.email.email,
          },
          app: appConfig,
          i18n,
          config: {
            waitlist: enableWaitlist,
            provisionedAccountEmailDomain:
              process.env.PROVISIONED_EMAIL_DOMAIN ?? "provisioned.starter-app.local",
          },
          options: {
            secret: process.env.BETTER_AUTH_SECRET ?? "QJvCmK9UBuHAWbNr2vV3ROVt8XrBYV5d",
          },
        });
      },
    },
  },
  [
    new EmailModule(templates as never),
    new AuthModule(),
    // m5k:files:start
    new FileModule(),
    // m5k:files:end
    // m5k:workflows:start
    new WorkflowModule({
      queues: {
        fast: { concurrency: 5 },
      },
      defaultQueue: "fast",
      defaults: {
        timeout: 60_000,
        jobOptions: { removeOnComplete: { age: 3600 } },
      },
      reconcile: { enabled: true },
    }),
    new DemoWorkflowModule(),
    // m5k:workflows:end
    // m5k:notifications:start
    new NotificationModule(),
    // m5k:notifications:end
    new PostsModule(),
    new EmailPreviewModule({ allowDelete: process.env.NODE_ENV !== "production" }),
    // m5k:test-harness:start
    new TestHarnessModule(),
    // m5k:test-harness:end
  ] as const
);
