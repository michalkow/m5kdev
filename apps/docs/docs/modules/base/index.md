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
- `workflows({ services, workflow })` — optional extra job wiring. The kernel
  also scans every service object for job/cron definitions (see
  [Workflow](/modules/workflow)).

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
`flattenNestedGrants({ resource: { level: { role: { action: Access } } } })`.
Canonical actions are `read`, `write`, `delete`, and `publish`; guard action
names must match grant action names exactly.

Access modes:

| Access | Meaning |
| --- | --- |
| `all` | Any entity. Use for platform/user-level admins only. |
| `org` | Same Organization (`entity.organizationId === actor.organizationId`). Prefer this for org owner/admin. |
| `own` | Ownership. In org context, user-level `"own"` compares `Entity.memberId` to the actor’s `memberId` when present (legacy `userId` dual-read if `memberId` is missing). |
| `none` | Explicit deny. |

Stamp and authorize org assets with `memberId`; keep `userId` for personal
resources. `addContextFilter` accepts `"member"` for member-owned lists;
`["user", "organization"]` filters by `userId` and `organizationId` without
remapping to `memberId`.

`.access` on an **array** or `{ rows, total }` list result **soft-filters** to
allowed rows (empty is OK) and writes the filtered value back to
`state[entityStep]`. A single entity returns `FORBIDDEN` when denied.
`total` is reduced by the number of rows removed from **this page**, not
recomputed from the full table.

### Service procedures

Request-bound methods are declared with the procedure builder instead of plain
async functions:

```ts
list = this.procedure("list")
  .input(itemSchemas.input.list)
  .output(itemSchemas.output.list)
  .requireAuth("organization")
  .addContextFilter(["organization"])
  .addFilters(() => ({
    columnId: "status",
    type: "enum",
    method: "equals",
    value: "active",
  }))
  .loadResource("items", ({ input }) => this.repository.item.queryList(input))
  .access({ action: "read", entityStep: "items" })
  .handle(({ state }) => state.items);
```

Typical builder order: `.input` / `.output` → `.requireAuth` →
`.addContextFilter` / `.addFilters` → `.loadResource` / `.use` → `.access` →
`.handle`. Runtime Zod validation is off unless you pass `true` as the second
argument to `.input` / `.output`.

`.addFilters(resolve)` appends one `QueryFilter` or an array onto
`input.filters` (other query fields are preserved). Call it once per procedure.
Use it for extra clauses that depend on actor or loaded state; use
`.addContextFilter` for tenancy.

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
