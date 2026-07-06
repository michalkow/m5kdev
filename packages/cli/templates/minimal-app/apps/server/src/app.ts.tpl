import { createBackendApp } from "@m5kdev/backend/app";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { templates } from "{{PACKAGE_SCOPE}}/email";
import { emailResources } from "{{PACKAGE_SCOPE}}/email/resources";
import { APP_NAME } from "{{PACKAGE_SCOPE}}/shared/modules/app/app.constants";
import { AUTH_LOCALE_CONFIG } from "{{PACKAGE_SCOPE}}/shared/modules/app/locale.constants";
import { USER_LOCALE_HEADER } from "@m5kdev/commons/modules/auth/auth.constants";
import cors from "cors";
import express from "express";
import { schema } from "./generated/schema";
import { PostsModule } from "./modules/posts/posts.module";

const app = express();
const appUrl = process.env.VITE_APP_URL ?? "http://localhost:5173";
const serverUrl = process.env.VITE_SERVER_URL ?? "http://localhost:8080";
const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const syncUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
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

app.use(express.json());
app.use(
  cors({
    origin: [appUrl],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Waitlist-Invitation-Code",
      "Organization-Invitation-Code",
      "Admin-Create-Verified-User",
      USER_LOCALE_HEADER,
    ],
  })
);

export const builtBackendApp = createBackendApp(
  {
    db: connection,
    express: app,
    schema: schema as never,
    app: {
      name: APP_NAME,
      urls: {
        web: appUrl,
        api: serverUrl,
      },
      locales: AUTH_LOCALE_CONFIG,
    },
    i18n: {
      resources: emailResources,
    },
    redis: {
      url: redisUrl,
      options: { maxRetriesPerRequest: null },
    },
    resend: resendApiKey ? { apiKey: resendApiKey } : undefined,
    email: {
      mode: resendApiKey ? "send" : "store",
      from: "no-reply@local.m5kdev.test",
      systemNotificationEmail: "ops@local.m5kdev.test",
      outputDirectory: ".emails",
    },
    auth: {
      factory({ db, services, appConfig, i18n }) {
        return createBetterAuth({
          orm: db.orm as never,
          schema: db.schema as never,
          services: {
            email: services.email.email,
          },
          app: appConfig,
          i18n,
          config: {
            waitlist: enableWaitlist,
            provisionedAccountEmailDomain: "provisioned.{{APP_SLUG}}.local",
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
    new WorkflowModule({
      queues: {
        fast: { concurrency: 5 },
      },
      defaultQueue: "fast",
      defaults: {
        timeout: 60_000,
        jobOptions: { removeOnComplete: { age: 3600 } },
      },
    }),
    new NotificationModule(),
    new PostsModule(),
  ] as const
);

export const appRouter = builtBackendApp.trpc.router;
export type AppRouter = typeof appRouter;
