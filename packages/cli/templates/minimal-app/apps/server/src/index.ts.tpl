import { createAuthContext } from "@m5kdev/backend/utils/trpc";
import * as trpcExpress from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import type { Server } from "node:http";
import { auth } from "./lib/auth";
import { notificationService } from "./service";
import { appRouter } from "./trpc";
import { workflowRegistry, workflowService } from "./workflow";

workflowRegistry.registerService(notificationService);

const app = express();
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8080;

let httpServer: Server | undefined;

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

function logError(context: string, error: unknown): void {
  console.error(`[server] ${context}`, error);
}

async function shutdown(): Promise<void> {
  try {
    await workflowRegistry.stop();
  } catch (e) {
    logError("workflowRegistry.stop() failed", e);
  }
  try {
    await workflowService.close();
  } catch (e) {
    logError("workflowService.close() failed", e);
  }
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer?.close((err) => {
        if (err) {
          logError("HTTP server close failed", err);
        }
        resolve();
      });
    });
  }
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
  await new Promise<void>((resolve, reject) => {
    httpServer = app.listen(port, () => {
      console.info(`Server running at ${process.env.VITE_SERVER_URL ?? `http://localhost:${port}`}`);
      resolve();
    });
    httpServer.on("error", reject);
  });
}

void (async () => {
  try {
    await start();
  } catch (e) {
    logError("Fatal: workflowRegistry.start() or HTTP listen failed", e);
    process.exit(1);
  }
})();
