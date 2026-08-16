# Kernel owns the Express HTTP shell

Express stays the HTTP vendor, but the Kernel owns the default shell so a library release can change CORS headers, JSON defaults, listen, and signal shutdown without asking every app to edit starter conventions. Apps still get the Express instance back; extra routes belong on a Backend Module `express` hook. JSON and CORS are maps over Kernel defaults (`(defaults) => next`); omitting a default drops it — same trust as passing your own Express.

Callers may pass an Express instance; the Kernel still applies json/CORS onto it. Passing an instance that already has json/CORS is unsupported. `start()` listens on `PORT` (fallback 8080) at `0.0.0.0` unless `listen: false`. When listening, SIGINT/SIGTERM closes HTTP, then Kernel shutdown, then `onShutdown` (telemetry), then process exit. OTEL stays an app `import "./instrumentation"` so the Kernel does not force tracing.

## Considered Options

- **App-owned Express** (today: starter `express()` + `cors()` + `listen` + signals, pass into `createBackendApp`) — rejected: each new library header becomes an app/migration edit.
- **Drop `config.express`** — rejected: embedding and extra middleware (helmet, logging) still need a pass-in; the contract is "don't json/cors it first."
- **Union library `allowedHeaders` after the CORS map** — rejected: the map is the options object; apps that forget to spread are on their own, like pass-express.
- **Kernel does not listen** — rejected: listen/signals/close order is the same class of stale starter convention as CORS headers.
- **Default `listen: false` / auto-skip in `NODE_ENV=test`** — rejected: product entry should be `start()`; tests opt out. Hidden env control flow is worse than a documented footgun.
- **Kernel owns OTEL** — rejected: instrumentation must load before other imports and must stay optional.
