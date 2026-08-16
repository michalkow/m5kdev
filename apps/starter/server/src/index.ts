import "./instrumentation";
import { builtBackendApp } from "./app";

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8080;

void (async () => {
  try {
    await builtBackendApp.start();
    console.info(`Server running at ${process.env.VITE_SERVER_URL ?? `http://localhost:${port}`}`);
  } catch (e) {
    console.error("[server] Fatal: builtBackendApp.start() failed", e);
    process.exit(1);
  }
})();
