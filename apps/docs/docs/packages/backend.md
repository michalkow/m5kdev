---
sidebar_position: 2
---

# Backend package

`@m5kdev/backend` is the composable Express Kernel. It owns Kernel
infrastructure, Core Modules, repositories, services, tRPC fragments, Express
hooks, and `createBackendApp` composition. Optional Backend Modules
(`@m5kdev/module-*`) depend on this package and are registered in the same
modules array.

## Use it for

- Creating backend apps with `createBackendApp`.
- Registering first-party and app-specific modules.
- Defining repositories and services behind module boundaries.
- Wiring tRPC routers, Express routes, workflows, auth, and infrastructure.

## Module docs

Start with the [module index](/modules): Kernel infrastructure, Core Modules,
Optional Backend Modules, and Shared-contract / UI surfaces.

List endpoints: [List query and Match query](/guides/list-query-and-match-query).
HTTP shell: [Kernel Express HTTP shell](/guides/v0.33.0-kernel-express-http-shell-migration).
Database commands: [Kernel Database commands](/guides/v0.34.0-kernel-database-commands-migration).
Core vs Optional Backend Modules: [0.34.0 packaging split](/guides/v0.34.0-core-optional-backend-modules-migration).
Docker / Fly / Node 24: [0.34.0 deploy](/guides/v0.34.0-fly-deploy-migration).
Fly deploy wrappers in the Kernel: [0.35.0 Fly commands](/guides/v0.35.0-kernel-fly-commands-migration).
Server events (SSE): [0.35.0 Server events](/guides/v0.35.0-kernel-server-events-migration).
Mastra helpers and Conversation: [0.34.0 agents](/guides/v0.34.0-mastra-app-owned-agents-migration).
Billing trial warning: [0.34.0 trial email](/guides/v0.34.0-billing-trial-ending-email-migration).
Catalog pins and boundary peers: [Catalog lockstep](/guides/v0.33.0-catalog-lockstep-migration).

## Database commands

Kernel `runDb` from `@m5kdev/backend/db` owns reset / sync / seed. The app
supplies App schema and optional seed in server `db.ts`. **Do not import
`app.ts`** from that file — Database commands must not boot HTTP, Redis, or
queues.

Starter scripts (from `apps/starter/server`):

```sh
pnpm --filter ./apps/server drizzle:reset
pnpm --filter ./apps/server drizzle:sync
pnpm --filter ./apps/server drizzle:seed
```

Stop the server first for `file:` databases, or the local-file guard aborts
(override with `SKIP_DB_GUARD=true` only when you know nothing else holds the
file). drizzle-kit `generate` / `migrate` / `studio` stay app-owned.

Full upgrade path:
[Kernel Database commands](/guides/v0.34.0-kernel-database-commands-migration).

## Package rule

Keep persistence logic in repositories, business logic in services, and transport
wiring in routers or tRPC files.

## Telemetry

OpenTelemetry tracing and correlated Pino logging are opt-in via
`import "./instrumentation"` first in the server entry and `OTEL_*` environment
variables. Pass `onShutdown: shutdownTelemetry` to `createBackendApp`. See
[Telemetry migration](/guides/telemetry-migration) and
[Kernel Express HTTP shell](/guides/v0.33.0-kernel-express-http-shell-migration).
