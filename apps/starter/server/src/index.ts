import "./instrumentation";
import { builtBackendApp } from "./app";

void (async () => {
  try {
    await builtBackendApp.start();
    console.info(`Server running at ${builtBackendApp.config.app.urls.api ?? "local listener"}`);
  } catch (e) {
    console.error("[server] Fatal: builtBackendApp.start() failed", e);
    process.exit(1);
  }
})();
