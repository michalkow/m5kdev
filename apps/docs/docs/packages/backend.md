---
sidebar_position: 2
---

# Backend package

`@m5kdev/backend` is the composable Express backend stack. It owns backend module
contracts, repositories, services, tRPC fragments, Express hooks, and app-kernel
composition.

## Use it for

- Creating backend apps with `createBackendApp`.
- Registering first-party and app-specific modules.
- Defining repositories and services behind module boundaries.
- Wiring tRPC routers, Express routes, workflows, auth, and infrastructure.

## Module docs

Start with these module pages:

- [File](/modules/file)
- [Auth](/modules/auth)
- [Billing](/modules/billing)
- [Workflow](/modules/workflow)
- [Notification](/modules/notification)
- [Base](/modules/base)

## Package rule

Keep persistence logic in repositories, business logic in services, and transport
wiring in routers or tRPC files.
