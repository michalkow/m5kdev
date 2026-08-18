# Kernel owns baked SPA static serving

The product Fly image is server plus a Vite-built webapp copied to `spa.root` (Starter: `./client`). Serving that directory is Kernel HTTP shell, same class as JSON, CORS, and listen: a library release can change mount order, SPA fallback, and skip-if-missing without every app editing starter `app.ts`. `createBackendApp({ spa: { root } })` is opt-in; if the directory is missing, the Kernel does not mount static files (local `pnpm dev` keeps Vite on 5173). Other extra HTTP still belongs on a Backend Module `express` hook ([ADR-0003](0003-kernel-owns-express-http-shell.md)).

## Considered Options

- **Starter `app.ts` after `createBackendApp`** (MyJournal) — rejected: repeats the stale-convention problem ADR-0003 removed for CORS/listen.
- **Backend Module `express` hook** — rejected for this case: every scaffolded server would copy the same static + SPA-fallback glue; that is shell, not module HTTP.
- **Always serve `./client` when `NODE_ENV=production`** — rejected: hidden env control flow; opt-in `spa.root` is explicit and skips when the directory is absent.
