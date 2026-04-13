import { createBackendApp, type InferBackendAppRouter } from "@m5kdev/backend/app";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import cors from "cors";
import express from "express";
import {
  authBackendModule,
  emailBackendModule,
  notificationBackendModule,
  postsBackendModule,
  workflowBackendModule,
} from "./modules";

const app = express();
const appUrl = process.env.VITE_APP_URL ?? "http://localhost:5173";
const serverUrl = process.env.VITE_SERVER_URL ?? "http://localhost:8080";

app.use(express.json());
app.use(
  cors({
    origin: [appUrl],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const syncUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const resendApiKey = process.env.RESEND_API_KEY;

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

export const backendApp = createBackendApp({
  db: connection,
  express: app,
  app: {
    name: "{{APP_NAME}}",
    urls: {
      web: appUrl,
      api: serverUrl,
    },
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
    factory({ db, services, appConfig }) {
      return createBetterAuth({
        orm: db.orm as never,
        schema: db.schema as never,
        services: {
          email: services.email.email,
        },
        app: appConfig,
        config: {
          waitlist: false,
        },
      });
    },
  },
})
  .use(emailBackendModule)
  .use(authBackendModule)
  .use(workflowBackendModule)
  .use(notificationBackendModule)
  .use(postsBackendModule);

export const builtBackendApp = backendApp.build();
export const appRouter = builtBackendApp.trpc.router;

export type AppRouter = InferBackendAppRouter<typeof backendApp>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
