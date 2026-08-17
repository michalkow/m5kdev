import "./instrumentation";
import { builtBackendApp } from "./app";

void (async () => {
  try {
    await builtBackendApp.start();
    console.info(`Server running at ${process.env.VITE_SERVER_URL}`);
  } catch (e) {
    console.error("[server] Fatal: builtBackendApp.start() failed", e);
    process.exit(1);
  }
})();
