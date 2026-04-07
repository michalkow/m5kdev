import { createAuthContext } from "@m5kdev/backend/utils/trpc";
import * as trpcExpress from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { auth } from "./lib/auth";
import { notificationService } from "./service";
import { appRouter } from "./trpc";
import { workflowRegistry, workflowService } from "./workflow";

workflowRegistry.registerService(notificationService);

const app = express();
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8080;

app.use(express.json());
app.use(
  cors({
    origin: [process.env.VITE_APP_URL ?? "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: createAuthContext(auth as never),
  }),
);

app.all("/api/auth/*", toNodeHandler(auth));

async function shutdown(): Promise<void> {
  await workflowRegistry.stop();
  await workflowService.close();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

async function start(): Promise<void> {
  await workflowRegistry.start();
  app.listen(port, () => {
    console.info(`Server running at ${process.env.VITE_SERVER_URL ?? `http://localhost:${port}`}`);
  });
}

void start();
