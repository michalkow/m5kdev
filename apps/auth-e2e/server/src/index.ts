import type { Server } from "node:http";
import { builtBackendApp } from "./app";

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 18180;

let httpServer: Server | undefined;

function logError(context: string, error: unknown): void {
  console.error(`[auth-e2e-server] ${context}`, error);
}

async function shutdown(): Promise<void> {
  try {
    await builtBackendApp.shutdown();
  } catch (error) {
    logError("builtBackendApp.shutdown() failed", error);
  }

  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer?.close((error) => {
        if (error) {
          logError("HTTP server close failed", error);
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
  await builtBackendApp.start();
  await new Promise<void>((resolve, reject) => {
    const server = builtBackendApp.express.app.listen(port, "127.0.0.1", () => {
      console.info(`Auth E2E server running at http://127.0.0.1:${port}`);
      resolve();
    });
    httpServer = server;
    server.on("error", reject);
  });
}

void start().catch((error) => {
  logError("Fatal startup failure", error);
  process.exit(1);
});
