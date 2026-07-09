---
sidebar_position: 11
---

# Base module

The base module is the framework core that every other module builds on: the
module contract, repository/service base classes, actors, grants, service
procedures, and the result/error pattern.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Base constants and schemas shared across modules. |
| `@m5kdev/backend` | `BaseModule`, base repositories, `BaseService` / `BasePermissionService`, actors, grants, service procedures, query helpers. |

## BaseModule

Backend modules extend `BaseModule<Deps, Tables, Repositories, Services, Routers>`
and override lifecycle methods the kernel calls in order:

- `repositories({ db, deps })` — construct repositories from Drizzle tables.
- `services({ repositories, deps, appConfig, infra, i18n })` — construct services.
- `trpc({ services, deps })` — return namespaced tRPC router fragments
  (via `createBackendRouterMap`).
- `express({ services, infra })` — mount Express routes.
- `workflows({ services })` — register queue jobs and cron schedules.

Modules declare `dependsOn` / `optionalDependsOn` by module id; the kernel
resolves order and passes resolved dependencies through `deps`.

## Actors

Service calls are made on behalf of an actor: `UserActor`, `OrganizationActor`,
`TeamActor`, or `AdminActor` (`base.actor.ts`). `AuthenticatedActor` is the
union used by permission checks; scopes are `user`, `organization`, `team`, and
`admin`.

## Services and permissions

- `BaseService<Repositories, Services>` — dependency-injected business logic
  with no permission enforcement.
- `BasePermissionService` — adds grant-based checks via `accessGuard` /
  `accessGuardAsync`.

Grants are declared per module in `<module>.grants.ts` with
`flattenNestedGrants({ module: { scope: { role: { action: "own" | "all" } } } })`.
Canonical actions are `read`, `write`, `delete`, and `publish`; guard action
names must match grant action names exactly.

### Service procedures

Request-bound methods are declared with the procedure builder instead of plain
async functions:

```ts
getPreferences = this.procedure("getPreferences")
  .access({ scope: "user", action: "read" })
  .handler(async ({ ctx }) => { /* ... */ });
```

Procedures bundle input mapping, access checks, and entity loading so tRPC
handlers stay thin. See `MIGRATING_TO_SERVICE_PROCEDURES.md` in the backend
package for the migration path.

## Results and errors

All fallible service and repository methods return `ServerResult<T>` /
`ServerResultAsync<T>` (`neverthrow`). Use `ok`/`err`, `throwable` /
`throwableAsync` in base classes, `this.error(...)` for expected failures, and
`handleTRPCResult(...)` to unwrap in tRPC handlers.

## Query helpers

`base.query.ts` plus the [utils module](/modules/utils) implement the shared
list contract from `@m5kdev/commons` (`querySchema`): pagination, sorting,
filters, and global search that the [table module](/modules/table) consumes on
the frontend.
