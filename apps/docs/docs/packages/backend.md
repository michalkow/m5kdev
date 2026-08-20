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
Catalog pins and boundary peers: [Catalog lockstep](/guides/v0.33.0-catalog-lockstep-migration).

## Package rule

Keep persistence logic in repositories, business logic in services, and transport
wiring in routers or tRPC files.

## Telemetry

OpenTelemetry tracing and correlated Pino logging are opt-in via
`import "./instrumentation"` first in the server entry and `OTEL_*` environment
variables. Pass `onShutdown: shutdownTelemetry` to `createBackendApp`. See
[Telemetry migration](/guides/telemetry-migration) and
[Kernel Express HTTP shell](/guides/v0.33.0-kernel-express-http-shell-migration).
