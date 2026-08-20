---
sidebar_position: 11
---

# Kernel infrastructure (Base)

Base is Kernel infrastructure, not a Backend Module. Do not pass it to
`createBackendApp`. Every Backend Module builds on this contract: repositories,
services, actors, Grants, procedures, and the result/error pattern.

Prefer `@m5kdev/backend/base/*`. The Kernel still re-exports the same types from
`@m5kdev/backend/modules/base/*`.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Base constants and schemas shared across modules. |
| `@m5kdev/backend` | `BaseModule`, base repositories, `BaseService` / `BasePermissionService`, actors, grants, service procedures, list/match query helpers. |

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

Organization and team scopes require `memberId` in addition to org
id/role (and team id/role for team scope). That member id is the principal for
org-scoped `"own"` ownership — see
[Organizations and members](/guides/organizations-and-members).

## Services and permissions

- `BaseService<Repositories, Services>` — dependency-injected business logic
  with no permission enforcement.
- `BasePermissionService` — adds grant-based checks via `accessGuard` /
  `accessGuardAsync`.

Grants are declared per module in `<module>.grants.ts` with
`flattenNestedGrants({ module: { scope: { role: { action: "own" | "all" } } } })`.
Canonical actions are `read`, `write`, `delete`, and `publish`; guard action
names must match grant action names exactly.

In organization context, user-level `"own"` compares `Entity.memberId` to the
actor’s `memberId` when present (with legacy `userId` dual-read for
rows that still lack `memberId`). Stamp and authorize org assets with
`memberId`; keep `userId` for personal resources. `addContextFilter` accepts
`"member"` for member-owned lists; `["user", "organization"]` filters by
`userId` and `organizationId` without remapping to `memberId`.

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

`BaseTableRepository` serves two parallel list stacks from
`@m5kdev/commons`:

- **List query** — `queryList` / `queryFind` / `.addFilters`, input
  `createZodSchemas(table).input.list` (`querySchema`).
- **Match query** — `matchList` / `matchFind` / `.addMatch`, input
  `createZodSchemas(table).input.matchList` (`matchQuerySchema`).

`.addContextFilter` writes QueryFilters and belongs on List query only. Scope
Match query with `.addMatch` (a map: return the next QueryMatch; no auto-merge).

Pagination, sorting, `q`, and soft-delete are shared. Operator semantics and
opt-in steps:
[List query and Match query](/guides/list-query-and-match-query),
[Match query migration](/guides/v0.33.0-match-query-migration).
