---
sidebar_position: 2
---

# Auth module

The auth module spans shared auth schemas, backend Better Auth wiring, frontend
session hooks, and web UI route components.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Shared auth schemas. |
| `@m5kdev/backend` | Auth DB tables, middleware, service logic, tRPC procedures, and Better Auth integration. |
| `@m5kdev/frontend` | Auth provider and session/admin hooks. |
| `@m5kdev/web-ui` | Login, signup, profile, organization, and protected route UI. |

## Documentation status

This page is scaffolded. Fill it by documenting app-level auth setup first, then
backend service behavior, frontend hooks, and route-level UI components.
