// biome-ignore-all assist/source/organizeImports: feature-gated module imports stay in marker blocks
import { createBackendApp } from "@m5kdev/backend/app";
import { isDeployedEnvironment, requireEnvValue } from "@m5kdev/backend/base/environment";
import { shutdownPosthog } from "@m5kdev/backend/lib/posthog";
import { shutdownTelemetry } from "@m5kdev/backend/lib/otel";
// m5k:ai:start
import { defineBackendModule } from "@m5kdev/backend/app";
import { AIModule } from "@m5kdev/backend/modules/ai/ai.module";
// m5k:ai:end
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { EmailPreviewModule } from "@m5kdev/backend/modules/email/email.preview.module";
// m5k:files:start
import { FileModule } from "@m5kdev/backend/modules/file/file.module";
// m5k:files:end
// m5k:mcp:start
import { McpModule } from "@m5kdev/backend/modules/mcp/mcp.module";
// m5k:mcp:end
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
// m5k:notifications:start
import { NOTIFICATION_KINDS } from "@starter-app/shared/modules/notification/notification.constants";
// m5k:notifications:end
// m5k:ai:start
import {
  conversationStorage,
  mastra,
  openrouter,
  verifyConversationPersistence,
} from "./modules/conversation/conversation.mastra";
import { conversationVectorSchema } from "./modules/conversation/conversation.persistence";
// m5k:ai:end
// m5k:workflows:start
import { DemoWorkflowModule } from "./modules/demo-workflow/demo-workflow.module";
// m5k:workflows:end
import { PostsModule } from "./modules/posts/posts.module";
// m5k:test-harness:start
import { TestHarnessModule } from "./modules/test-harness/test-harness.module";
// m5k:test-harness:end
import * as schema from "./schema";

// Local fallbacks apply only when APP_ENV=local; deployed environments fail at boot.
const appUrl = requireEnvValue("VITE_APP_URL", { localDefault: "http://localhost:5173" });
const serverUrl = requireEnvValue("VITE_SERVER_URL", { localDefault: "http://localhost:8080" });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must point to the runtime PgBouncer connection");
// m5k:workflows:start
const redisUrl = requireEnvValue("REDIS_URL", { localDefault: "redis://127.0.0.1:6379" });
// m5k:workflows:end
const resendApiKey = process.env.RESEND_API_KEY;
const enableWaitlist = process.env.VITE_ENABLE_WAITLIST === "true";

const connection = { connectionString: databaseUrl };

export const builtBackendApp = createBackendApp(
  {
    db: connection,
    schema,
    onShutdown: async () => {
      await Promise.all([shutdownPosthog(), shutdownTelemetry()]);
    },
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
      factory({ db, services, appConfig, i18n, mcp }) {
        return createBetterAuth({
          orm: db.orm,
          schema: db.schema,
          services: {
            email: services.email.email,
          },
          app: appConfig,
          i18n,
          mcp,
          config: {
            waitlist: enableWaitlist,
            provisionedAccountEmailDomain:
              process.env.PROVISIONED_EMAIL_DOMAIN ?? "provisioned.starter-app.local",
          },
          options: {
            secret: requireEnvValue("BETTER_AUTH_SECRET", {
              localDefault: "QJvCmK9UBuHAWbNr2vV3ROVt8XrBYV5d",
            }),
          },
        });
      },
    },
  },
  [
    new EmailModule(templates as never),
    new AuthModule(),
    // m5k:mcp:start
    new McpModule(),
    // m5k:mcp:end
    // m5k:ai:start
    new AIModule({
      libs: { mastra, openrouter },
      vectorStore: {
        connectionString: process.env.VECTOR_DATABASE_URL || databaseUrl,
        schemaName: conversationVectorSchema,
      },
    }),
    defineBackendModule({
      id: "conversation-persistence",
      startup: verifyConversationPersistence,
      shutdown: () => conversationStorage.close(),
    }),
    // m5k:ai:end
    // m5k:files:start
    new FileModule(),
    // m5k:files:end
    // m5k:workflows:start
    new WorkflowModule({
      queues: {
        "starter-app-main": { concurrency: 5 },
      },
      defaultQueue: "starter-app-main",
      defaults: {
        timeout: 60_000,
        jobOptions: { removeOnComplete: { age: 3600 } },
      },
      reconcile: { enabled: true },
    }),
    new DemoWorkflowModule(),
    // m5k:workflows:end
    // m5k:notifications:start
    new NotificationModule({ kinds: NOTIFICATION_KINDS }),
    // m5k:notifications:end
    new PostsModule(),
    new EmailPreviewModule({ allowDelete: !isDeployedEnvironment() }),
    // m5k:test-harness:start
    new TestHarnessModule(),
    // m5k:test-harness:end
  ] as const
);
