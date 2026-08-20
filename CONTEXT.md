# m5kdev

Opinionated TypeScript stack for AI SaaS apps. This file is the domain glossary: what each term *is*. Stack vendors and durable shape belong here ([ADR-0001](docs/adr/0001-glossary-names-stack-vendors.md)); layer rules live in `AGENTS.md`.

## Language

### Tenancy

**Organization**:
The default tenancy unit. Every authenticated User belongs to at least one, including single-user products where the org stays invisible in the UI.
_Avoid_: Workspace, tenant, account, company

**Membership**:
A durable `members` row (`userId` + `organizationId` + `role`). Leave soft-deletes it; rejoin revives the same row so MemberId stays stable.
_Avoid_: OrgUser, OrganizationUser; using "member" to mean only the default role name

**Member**:
The Membership principal used to attribute and authorize org-scoped assets.
_Avoid_: User (when you mean the membership), author, owner (when you mean the membership row)

**MemberId**:
The Membership id stamped on org-scoped rows. In organization context, `"own"` grants compare this field, not UserId.
_Avoid_: authorMemberId, createdBy; UserId as the org ownership key

**User**:
The global Better Auth identity. Owns personal resources that are not org tenancy.
_Avoid_: Account, Customer, Client, Member

**UserId**:
The User id. Correct key for personal resources (billing, devices, OAuth, sessions) and optional audit dual-write. Not the org-scoped ownership key.
_Avoid_: MemberId (they are different principals)

**Team**:
An optional subgroup inside an Organization. Team-scoped Actors require MemberId plus team id and role.
_Avoid_: Organization (teams nest inside orgs)

**Invitation**:
An Organization or Team membership invite.
_Avoid_: Waitlist code, Account claim

**Waitlist**:
A signup gate: a User is not created until an invitation code is accepted.
_Avoid_: Invitation (that is org membership), Account claim

**Account claim**:
An admin-provisioned User that a person later claims via code or magic link.
_Avoid_: Invitation, Waitlist, signup

### Identity and access

**Actor**:
Who a Service call is made on behalf of: `UserActor`, `OrganizationActor`, `TeamActor`, or `AdminActor`. Organization and team scopes require MemberId.
_Avoid_: Session, Context, Principal, Request

**ActorScope**:
Auth requirement on a Procedure: `user` | `organization` | `team` | `admin`.
_Avoid_: Level (that is Grants), Role, Access

**Grant**:
A flattened permission tuple: resource, level (`user` | `team` | `organization`), role, Action, Access. Declared in `<module>.grants.ts`.
_Avoid_: Permission, Policy, ACL, CASL statement, AccessModule (removed; Access is Grant width only)

**Action**:
Canonical Grant verbs: `read`, `write`, `delete`, `publish`.
_Avoid_: update, create, patch, remove (use `write` / `delete`)

**Access**:
How wide a Grant is: `all` (any entity), `own` (ownership), `org` (same Organization), `none` (explicit deny). Prefer `org` for org owner/admin, not `all`.
_Avoid_: Scope, Role

**Role**:
A named key at User, Organization, or Team scope, configured once in `defineAuthRoles` and passed through kernel metadata and `AppConfigProvider`. Starter defaults: User `user`/`admin`; Organization `member`/`admin`/`owner`.
_Avoid_: Grant, Access, permission

### Composition

**Kernel**:
`createBackendApp` — the composition root that wires libSQL/Drizzle, Redis, Better Auth, modules, tRPC, Express, startup, and shutdown ([ADR-0003](docs/adr/0003-kernel-owns-express-http-shell.md)). It owns the Express instance, JSON and CORS defaults (origin from the app web URL; library allowed headers), HTTP listen (PORT, all interfaces), and SIGINT/SIGTERM when it is listening. Signal shutdown closes HTTP, then Kernel shutdown, then app `onShutdown`, then process exit. JSON and CORS defaults may be mapped; a map that omits a default drops it. Callers may pass an Express instance that has not already applied json/CORS; the Kernel still applies that shell. Opt-in baked SPA serving (`spa.root`, skip if missing) is also Kernel HTTP shell ([ADR-0006](docs/adr/0006-kernel-owns-baked-spa.md)). Other extra HTTP belongs on a Backend Module `express` hook. Extra shutdown work (telemetry) registers on the Kernel, not a starter signal handler. One-shot Database commands are Kernel-owned and must not boot that HTTP shell, Redis, or queues ([ADR-0005](docs/adr/0005-kernel-owns-database-commands.md)).
_Avoid_: Framework (the stack is composable, not closed), App (that is the product), app-owned CORS as the default path; booting createBackendApp to reset or seed; ad-hoc `express.static` in starter `app.ts`

**Backend Module**:
A `BaseModule` subclass (or `defineBackendModule` object) that contributes tables, repositories, services, tRPC fragments, Express hooks, and workflows. Registered in `apps/*/server/src/app.ts` via `createBackendApp(config, [modules])`. Extra HTTP belongs on the module `express` hook, not ad hoc starter middleware. Baked SPA serving is Kernel shell, not a module hook ([ADR-0006](docs/adr/0006-kernel-owns-baked-spa.md)).
_Avoid_: Package, Plugin, Feature (when you mean the server module), Model; `backendApp.use`

**Kernel infrastructure**:
`BaseModule`, `BaseService` / `BasePermissionService`, Grants, Procedures, Actors, repositories, and list/match query helpers. Not a Backend Module — do not pass Base to `createBackendApp`. Canonical import `@m5kdev/backend/base/*` (`./modules/base/*` still re-exports).
_Avoid_: Utils Backend Module; calling Base "the module" as if it were Auth

**Core Module**:
A Backend Module that ships in the Kernel package. Apps may omit it from `createBackendApp`. Core set: AI, Auth, Billing, Connection, Email (`EmailModule`), File, Notification, Recurrence, Tag, Inbound callback, Workflow. `@m5kdev/email` is React Email chrome, not EmailModule.
_Avoid_: Optional Backend Module; putting Core Auth/Billing/File into `module-*` packages

**Optional Backend Module**:
A Backend Module published as `@m5kdev/module-<name>`: Clay, Docx, Pdf, Social, Video. `create-m5kdev` never adds these packages. When an app depends on one, the pin belongs in `catalogs.m5kdev`. Shared contracts/UI for those slices, if added, live in the Optional package — not commons/frontend/web-ui.
_Avoid_: calling Clay "the module" as if Auth were not one; importing them from `@m5kdev/backend/modules/...`

**Connection**:
Linked third-party API accounts. Module id and table stay `connect`. Not Better Auth login OAuth or the `accounts` table.
_Avoid_: Connect as the product noun; treating a Connection row as a login account

**Inbound callback**:
One-shot inbound callbacks with awaitable payloads. Module id and table stay `webhook`. Not Stripe Billing `POST /webhook`.
_Avoid_: Webhook (when you mean this primitive vs Stripe Subscription sync)

**App schema**:
The table map the app composes from Backend Module tables plus its own tables. One composition root, passed to the Kernel at boot, to drizzle-kit, and to Database commands.
_Avoid_: generated schema as the source of truth; Kernel merging tables the app did not compose; a second composition root in the Database config

**Database command**:
A one-shot Kernel operation on the app database: reset, sync, or seed. Dispatch and client construction belong to the Kernel; the app supplies App schema and optional seed ([ADR-0005](docs/adr/0005-kernel-owns-database-commands.md)).
_Avoid_: Starter Template copies of sync/reset/guard; treating drizzle-kit generate/migrate/studio as Database commands

**Database config**:
The app-owned module that passes App schema and optional seed into the Kernel Database command runner. Starter ships it as server `db.ts`. Command parsing is not this module's job.
_Avoid_: m5kdev.ts (that is not the CLI); an app-side command switchboard; composing App schema here

**Shared contract**:
Zod schemas and constants in `apps/*/shared` or `@m5kdev/commons` that server and clients both import.
_Avoid_: DTO (server select/output helpers), types package, API spec; calling this package the Fly app

**Deploy home**:
Where the product image’s Docker and Fly files live: `apps/shared` (Dockerfile, fly.toml, production env example). The image runs server plus a baked webapp. Repo-root `.dockerignore` is the build-context ignore file. Root `app:deploy` / `app:secrets` are the Fly CLI entrypoints.
_Avoid_: Shared contract (that is Zod/constants); treating `apps/shared` as a runnable Node service; a top-level `deploy/` folder; dockerignore copies beside the Dockerfile

**Procedure**:
A request-bound Service method built with `this.procedure("name")`: input, auth, resource load, Grant check, then handler.
_Avoid_: Endpoint, Resolver, Route, tRPC procedure (transport wraps this)

**Repository**:
Persistence and query construction for a Backend Module.
_Avoid_: DAO, Store, ORM wrapper

**Service**:
Business rules and orchestration. Owns Grants and Procedures.
_Avoid_: Controller, Use case, Manager

**List query**:
The QueryFilter list request: `page`, `limit`, `sort`, `order`, `filters`, `q`. Served by `queryList` / `queryFind` / `.addFilters`.
_Avoid_: Search params (that is nuqs URL state), Match query

**Match query**:
The QueryMatch list request: `page`, `limit`, `sort`, `order`, `match`, `q`. Served by `matchList` / `matchFind` / `.addMatch`.
_Avoid_: List query, Filter query

**QueryFilter**:
A UI clause on a List query: `columnId`, `type`, `method`, and `value`. Table UI and URL state stay in this dialect.
_Avoid_: QueryMatch; Filter as the name of the List query

**QueryMatch**:
An object of Match query predicates keyed by column. Values are a match, an operator map (SQL `$eq`/`$gt`/`$like`/… and table UI `$contains`/`$after`/`$intersect`/…), or `$and`/`$or`/`$not` groups. Table hooks may derive one from QueryFilters; a QueryMatch does not convert back.
_Avoid_: Filter document, Mongo filter, Filter object, QueryFilter

**Starter**:
`apps/starter` — the reference product: `server`, `webapp`, `landing`, `expo`, `email`, `e2e`, `shared`.
_Avoid_: Example, Template (CLI templates live in `packages/cli`)

**Managed catalog**:
The named pnpm catalog `catalogs.m5kdev` a scaffolded app shares with a framework release ([ADR-0004](docs/adr/0004-catalog-lockstep-and-boundary-peers.md)). Those pins move with the release. App-owned pins live in the default `catalog:`. The version promise is lockstep, not a newer compatible minor of drizzle or React than the Kernel.
_Avoid_: lockfile-only pins; Consumer catalog (that is the derived pin set)

**Consumer catalog**:
The catalog derived from Starter for scaffolded apps.
_Avoid_: Managed catalog (that is the app’s enrolled pin set); the stack workspace catalog (it may pin more than consumers get)

**Boundary library**:
A third-party whose types cross the app / `@m5kdev/*` package boundary. Closed set: `drizzle-orm`, `drizzle-zod`, `zod`, `neverthrow`, `@trpc/server`, `@trpc/client`, `react`, `react-dom`, `better-auth`, `express`, `@heroui/react`, `nuqs`. Published packages declare them as peers so the app and Kernel share one physical copy.
_Avoid_: nested Kernel deps (pino, BullMQ, AWS, OTEL exporters); treating OpenTelemetry as an app-facing peer

### Product surfaces

**Landing**:
The public marketing site package (`apps/landing`). A separate Fly app from the product image; Starter ships one page (name, pitch, CTA) on React Router + HeroUI v3 + Tailwind v4.
_Avoid_: Webapp (the authenticated SPA baked into the product image)

**Workflow**:
A BullMQ job (and optional cron) with a persisted run row. Status: `queued` | `running` | `completed` | `failed`. Payload is serializable ids and typed input, not a request.
_Avoid_: Job (the queue item is thinner than the persisted run), Queue, Task, Background process

**File**:
An S3 or local object, optionally inventoried as a `files` row. Upload status: `PENDING` | `UPLOADED` | `DELETED` | `FAILED`. Org-scoped Files stamp MemberId.
_Avoid_: Upload (the action), Asset, Attachment, Blob

**Plan**:
Stripe product/price configuration in app code (`StripePlan` / `StripePlansConfig`). Not a database row.
_Avoid_: Product, Tier, Subscription (that is the synced row)

**Subscription**:
Local row re-synced from Stripe; Stripe is the source of truth. Personal: keyed by UserId, not MemberId.
_Avoid_: Plan, Customer (Stripe customer linkage stays on the User)

**Tag**:
A polymorphic label attached to any resource type via taggings.
_Avoid_: Label, Category (unless the product truly means a separate taxonomy)
