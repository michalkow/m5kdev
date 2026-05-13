import { templates } from "@m5kdev/auth-e2e-email";
import { APP_NAME, type AuthE2EProfile } from "@m5kdev/auth-e2e-shared/modules/app/app.constants";
import { createBackendApp } from "@m5kdev/backend/app";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { EmailPreviewModule } from "@m5kdev/backend/modules/email/email.preview.module";
import cors from "cors";
import express from "express";
import { schema } from "./generated/schema";
import { PostsModule } from "./modules/posts/posts.module";
import { TestHarnessModule } from "./modules/test-harness/test-harness.module";

const app = express();

const profile = (process.env.AUTH_E2E_PROFILE ?? "standard") as AuthE2EProfile;
const appUrl = process.env.VITE_APP_URL ?? "http://127.0.0.1:15173";
const serverUrl = process.env.VITE_SERVER_URL ?? "http://127.0.0.1:18180";
const databaseUrl = process.env.DATABASE_URL ?? "file:./.auth-e2e/standard.db";
const emailOutputDirectory = process.env.EMAIL_OUTPUT_DIRECTORY ?? ".auth-e2e/emails-standard";

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
    ],
  })
);

export const builtBackendApp = createBackendApp(
  {
    db: {
      url: databaseUrl,
    },
    express: app,
    schema,
    app: {
      name: APP_NAME,
      urls: {
        web: appUrl,
        api: serverUrl,
      },
    },
    email: {
      mode: "store",
      from: "no-reply@auth-e2e.local",
      systemNotificationEmail: "ops@auth-e2e.local",
      outputDirectory: emailOutputDirectory,
    },
    auth: {
      factory({ db, services, appConfig }) {
        return createBetterAuth({
          orm: db.orm as never,
          schema: db.schema as never,
          services: {
            email: services.email.email,
          },
          app: appConfig,
          config: {
            waitlist: profile === "waitlist",
            provisionedAccountEmailDomain: "provisioned.auth-e2e.local",
          },
          options: {
            secret: process.env.BETTER_AUTH_SECRET ?? "auth-e2e-local-secret-auth-e2e-local-secret",
          },
        });
      },
    },
  },
  [
    new EmailModule(templates),
    new AuthModule(),
    new PostsModule(),
    new TestHarnessModule(),
    new EmailPreviewModule({ allowDelete: true }),
  ] as const
);

export const appRouter = builtBackendApp.trpc.router;
export type AppRouter = typeof appRouter;
