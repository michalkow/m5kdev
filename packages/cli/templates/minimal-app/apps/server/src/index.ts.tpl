import type { Server } from "node:http";
import { builtBackendApp } from "./app";
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8080;

let httpServer: Server | undefined;

function logError(context: string, error: unknown): void {
  console.error(`[server] ${context}`, error);
}

async function shutdown(): Promise<void> {
  try {
    await builtBackendApp.shutdown();
  } catch (e) {
    logError("builtBackendApp.shutdown() failed", e);
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
  await builtBackendApp.start();
  await new Promise<void>((resolve, reject) => {
    httpServer = builtBackendApp.express.app.listen(port, () => {
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
    logError("Fatal: builtBackendApp.start() or HTTP listen failed", e);
    process.exit(1);
  }
})();
