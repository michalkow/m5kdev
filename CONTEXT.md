# m5kdev

Opinionated TypeScript stack for AI SaaS apps. This file is the domain glossary: what each term *is*. Stack vendors and durable shape belong here ([ADR-0001](docs/adr/0001-glossary-names-stack-vendors.md)); layer rules live in `AGENTS.md`.

## Language

### Tenancy

**Organization**:
The default tenancy unit. Every authenticated User belongs to at least one, including single-user products where the org stays invisible in the UI.
_Avoid_: Workspace, tenant, account, company, Team (not a 1.0 tenancy unit; [ADR-0011](docs/adr/0011-no-team-at-1.0.md))

**Membership**:
A durable `members` row: one seat in an Organization. Invite creates it before a User exists (`userId` unset; email and name snapshots). Accept attaches that User to the same row. Leave, invite cancel, and invite expiry soft-delete it; rejoin or re-invite revives it so MemberId stays stable. An Organization has exactly one Owner. The Owner cannot leave; they delete the Organization, or a User-role `admin` transfers Owner first.
_Avoid_: OrgUser, OrganizationUser; a second live row for the same person in the same Organization; using "member" to mean only the default role name; treating Invitation as the seat; a second Owner; org self-service granting or transferring Owner

**Member**:
The Membership principal used to attribute and authorize org-scoped assets, including invited seats that do not yet have a User.
_Avoid_: User (when you mean the membership), author, owner (when you mean the membership row), Invitation

**MemberId**:
The Membership id stamped on org-scoped rows. In organization context, `"own"` grants compare this field, not UserId.
_Avoid_: authorMemberId, createdBy; UserId as the org ownership key

**User**:
The global Better Auth identity. Owns personal resources that are not org tenancy.
_Avoid_: Account, Customer, Client, Member

**UserId**:
The User id. Correct key for personal resources (devices, OAuth, sessions) and optional audit dual-write. Not the org-scoped ownership key. Billing is not a personal User resource.
_Avoid_: MemberId (they are different principals)

**Invitation**:
The accept token (email link, expiry) that attaches a User to an invited Membership. Auth Procedures mint and accept it; not a person and not assignable. See [ADR-0012](docs/adr/0012-auth-trpc-owns-membership.md).
_Avoid_: Waitlist code, Account claim, Team invite; pending Member; a principal apps stamp on rows; Better Auth invite HTTP as the public Membership API

**Waitlist**:
A signup gate: a User is not created until a Waitlist code is accepted. Users may mint those codes.
_Avoid_: Invitation (that is the Membership accept token), Account claim, createInvitationCode

**Account claim**:
An admin-provisioned User that a person later claims via code or magic link.
_Avoid_: Invitation, Waitlist, signup

### Identity and access

**Actor**:
Who a Service call is made on behalf of: `UserActor`, `OrganizationActor`, or `AdminActor`. Organization scope requires an active Membership (User attached, not soft-deleted). Invited Members are not Actors.
_Avoid_: Session, Context, Principal, Request, TeamActor

**ActorScope**:
Auth requirement on a Procedure: `user` | `organization` | `admin`.
_Avoid_: Level (that is Grants), Role, Access; `team`

**Grant**:
A flattened permission tuple: resource, level (`user` | `organization`), role, Action, Access. Declared in `<module>.grants.ts`.
_Avoid_: Permission, Policy, ACL, CASL statement, AccessModule (removed; Access is Grant width only); Grant level `team`

**Action**:
Canonical Grant verbs: `read`, `write`, `delete`, `publish`.
_Avoid_: update, create, patch, remove (use `write` / `delete`)

**Access**:
How wide a Grant is: `all` (any entity), `own` (ownership), `org` (same Organization), `none` (explicit deny). Prefer `org` for org owner/admin, not `all`.
_Avoid_: Scope, Role

**Role**:
A named key at User or Organization scope, configured once in `defineAuthRoles` and passed through kernel metadata and `AppConfigProvider`. Starter defaults: User `user`/`admin`; Organization `member`/`admin`/`owner`.
_Avoid_: Grant, Access, permission; Team role scope

**Owner**:
The Organization Role `owner`. Steady state is exactly one per Organization. Creating an Organization (signup) makes that User the Owner. Invite and org self-service cannot grant or change it. A User-role `admin` (AdminActor) may grant Owner only when there is none, or transfer when there is exactly one: promote an active Member and demote the previous Owner to Organization Role `admin` in one operation. Extra Owners from before this rule stay until an Admin demotes them; Auth refuses another Owner grant while more than one exists. The Owner cannot leave; they delete the Organization, or an Admin transfers first.
_Avoid_: multiple Owners as a product feature; inviting Owner; org members UI assigning Owner

### Composition

**Kernel**:
`createBackendApp` — the composition root that wires libSQL/Drizzle, Redis, Better Auth, modules, tRPC, Express, startup, and shutdown ([ADR-0003](docs/adr/0003-kernel-owns-express-http-shell.md)). It owns the Express instance, JSON and CORS defaults (origin from the app web URL; library allowed headers), HTTP listen (PORT, all interfaces), and SIGINT/SIGTERM when it is listening. Signal shutdown closes Server event streams, then HTTP, then the rest of Kernel shutdown, then app `onShutdown`, then process exit. JSON and CORS defaults may be mapped; a map that omits a default drops it. Callers may pass an Express instance that has not already applied json/CORS; the Kernel still applies that shell. Opt-in baked SPA serving (`spa.root`, skip if missing) is also Kernel HTTP shell ([ADR-0006](docs/adr/0006-kernel-owns-baked-spa.md)). Server events (SSE subscribe) are Kernel HTTP shell and Kernel infrastructure ([ADR-0010](docs/adr/0010-kernel-owns-server-events.md)). Other extra HTTP belongs on a Backend Module `express` hook. Extra shutdown work (telemetry) registers on the Kernel, not a starter signal handler. One-shot Database commands are Kernel-owned and must not boot that HTTP shell, Redis, or queues ([ADR-0005](docs/adr/0005-kernel-owns-database-commands.md)).
_Avoid_: Framework (the stack is composable, not closed), App (that is the product), app-owned CORS as the default path; booting createBackendApp to reset or seed; ad-hoc `express.static` in starter `app.ts`

**Backend Module**:
A `BaseModule` subclass (or `defineBackendModule` object) that contributes tables, repositories, services, tRPC fragments, Express hooks, and workflows. Registered in `apps/*/server/src/app.ts` via `createBackendApp(config, [modules])`. Extra HTTP belongs on the module `express` hook, not ad hoc starter middleware. Baked SPA serving and Server events are Kernel shell, not a module hook ([ADR-0006](docs/adr/0006-kernel-owns-baked-spa.md), [ADR-0010](docs/adr/0010-kernel-owns-server-events.md)).
_Avoid_: Package, Plugin, Feature (when you mean the server module), Model; `backendApp.use`

**Kernel infrastructure**:
`BaseModule`, `BaseService` / `BasePermissionService`, Grants, Procedures, Actors, repositories, list/match query helpers, and Server events. Not a Backend Module — do not pass Base to `createBackendApp`. Canonical import `@m5kdev/backend/base/*` (`./modules/base/*` still re-exports).
_Avoid_: Utils Backend Module; calling Base "the module" as if it were Auth

**Server event**:
A Kernel-owned, one-way HTTP Server-Sent Event that a resource was created, updated, or deleted. It is addressed to a UserId. It names the resource, its id, that change, and organizationId or null (a tag, not the audience). An optional snapshot of the entity may ride along. Services emit Server events through Auth; emitting to an Organization's Members is Auth resolving Memberships, not a bus audience. The authenticated User subscribes on one stream. The bus does not enforce Grants on snapshots. Not a Core Module. See [ADR-0010](docs/adr/0010-kernel-owns-server-events.md).
_Avoid_: organization-addressed fan-out; WebSocket; Subscription (that is Billing); Notification (that may consume one); Action (that is Grant); Inbound callback; Backend Module

**Core Module**:
A Backend Module that ships in the Kernel package. Apps may omit it from `createBackendApp`. Core set: AI, Auth, Billing, Connection, EmailModule, File, Notification, Recurrence, Tag, Inbound callback, Workflow. `@m5kdev/email` is React Email chrome, not EmailModule. EmailPreviewModule is a Kernel-exported helper, not a Core Module.
_Avoid_: Optional Backend Module; putting Core Auth/Billing/File into `module-*` packages; treating EmailPreviewModule as Core

**Optional Backend Module**:
A Backend Module published as `@m5kdev/module-<name>`: Clay, Docx, Pdf, Social, Video. `create-m5kdev` never adds these packages. When an app depends on one, the pin belongs in `catalogs.m5kdev`. At 1.0 they are experimental: lockstep Semver with the Kernel, quality not guaranteed. Shared contracts/UI for those slices, if added, live in the Optional package — not commons/frontend/web-ui.
_Avoid_: calling Clay "the module" as if Auth were not one; importing them from `@m5kdev/backend/modules/...`

**Connection**:
Linked third-party API accounts. Personal; keyed by UserId, not MemberId. Module id and table stay `connect`. Not Better Auth login OAuth or the `accounts` table.
_Avoid_: Connect as the product noun; treating a Connection row as a login account

**Inbound callback**:
One-shot inbound callbacks with awaitable payloads. Unattributed (not a User or Member resource). Module id and table stay `webhook`. Not Stripe Billing `POST /webhook`.
_Avoid_: Webhook (when you mean this primitive vs Stripe Subscription sync); Connection

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
Where the product image’s Docker and Fly files live: `apps/shared` (Dockerfile, fly.toml, production env example). The image runs server plus a baked webapp. Repo-root `.dockerignore` is the build-context ignore file. Root `app:deploy` / `app:secrets` call Kernel bins (`m5kdev-fly-deploy` / `m5kdev-fly-secrets`); the wrappers are not Starter copies ([ADR-0009](docs/adr/0009-kernel-owns-fly-commands.md)).
_Avoid_: Shared contract (that is Zod/constants); treating `apps/shared` as a runnable Node service; a top-level `deploy/` folder; dockerignore copies beside the Dockerfile; app-owned `fly-deploy.mjs` duplicates

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

**Frontend**:
The `@m5kdev/frontend` package: platform-agnostic React providers and data hooks, importable from the Webapp and Expo.
_Avoid_: Frontend Module; Web UI; visual chrome; browser-only APIs (HeroUI, React Router, nuqs, Web Push)

**Web UI**:
The `@m5kdev/web-ui` package: browser Webapp chrome (HeroUI, React Router, nuqs) and browser APIs.
_Avoid_: Frontend; Expo importing this package; treating a `modules/` folder as a registerable Backend Module

**Expo client**:
The `@m5kdev/expo` package: Expo-only adapters (native push). The Starter Expo app may import it; Frontend stays platform-agnostic.
_Avoid_: the Starter Expo app (`apps/*/expo`); putting Expo APIs in Frontend or Web UI

### Product surfaces

**Landing**:
The public marketing site package (`apps/landing`). A separate Fly app from the product image; Starter ships one page (name, pitch, CTA) on React Router + HeroUI v3 + Tailwind v4.
_Avoid_: Webapp (the authenticated SPA baked into the product image)

**Workflow**:
A persisted background run (optional cron). Status: `queued` | `running` | `completed` | `failed`. Payload is serializable ids and typed input, not a request. Org-scoped runs stamp MemberId.
_Avoid_: Job, Queue, Task, Recurrence (that is the repeating-event store)

**Recurrence**:
A repeating calendar pattern stored as a row with RRULE-shaped rules. A log of repeating events (for example employee shifts). Not a Workflow; the models are unrelated.
_Avoid_: Workflow, cron (that is Workflow), schedule

**Device**:
A User's push endpoint (web, iOS, Android). Personal; keyed by UserId, not MemberId. Web push and mobile push (iOS+Android) are different delivery Channels that use Devices.
_Avoid_: Notification (that is the inbox instance)

**EmailModule**:
The Core Module that renders registered Email templates and sends them through Resend. 1.0 apps register it with Auth (Auth depends on it). Not a Notification, not a Channel, not `@m5kdev/email` chrome. Notification may call it to deliver the email Channel; EmailModule does not own inbox or Channel policy.
_Avoid_: Email (the address or the Channel); Notification; the `@m5kdev/email` package; EmailModule without Auth as a 1.0 composition

**Email template**:
A named React Email document registered on EmailModule and selected by key at send time.
_Avoid_: Notification kind; chrome; CLI Template

**Notification kind**:
A developer-declared class of Notifications, listed in the app Shared contract. Mute and Channel preferences apply to the kind, not to a single instance.
_Avoid_: Notification (that is the instance); Email template; a kinds table as the source of truth

**Channel**:
A delivery means for a Notification: in-app, web push, mobile push, or email. In-app is visibility in the inbox, not whether the instance exists. Server event is not a Channel; creating a Notification emits a Server event addressed to that UserId.
_Avoid_: Server event; Device (that is the endpoint web/mobile push uses); treating SSE mute as a Channel

**Notification**:
A persisted inbox instance owned by a Member and classified by a Notification kind. Always inserted on send (orchestration), even when in-app is muted. Inbox visibility is decided at send from the in-app Channel; later preference changes do not hide or reveal existing instances. Unread until the Member marks it read. Org-scoped; keyed by MemberId. The inbox is that Membership only (the active Organization), not a merge across Organizations. First successful web push, mobile push, and email are stamped on the instance; every outbound attempt is a send log.
_Avoid_: UserId as the ownership key; Device, Email, push, send log, Server event

**Send log**:
An outbound delivery attempt for a Notification on web push, mobile push, or email (not in-app). Readable with that Notification. One attempt per Device or email send, not the inbox instance.
_Avoid_: Notification (the instance); Device (the endpoint)

**Notification preference**:
A Member's off switch for a Channel of a Notification kind. Offered Channels are that kind's default Channels and start on. Missing preference means on. Preference wins over the Channels named in send. Distinct per Membership, so the same User can mute a Channel in one Organization and leave it on in another.
_Avoid_: User-wide mute; browser or OS push permission; Device enabled flag

**File**:
An S3 or local object, optionally inventoried as a `files` row. Upload status: `PENDING` | `UPLOADED` | `DELETED` | `FAILED`. Org-scoped Files stamp MemberId.
_Avoid_: Upload (the action), Asset, Attachment, Blob

**Plan**:
Stripe product/price configuration in app code (`StripePlan` / `StripePlansConfig`). Not a database row.
_Avoid_: Product, Tier, Subscription (that is the synced row)

**Subscription**:
Local row re-synced from Stripe; Stripe is the source of truth. The billed party is the Organization, not a User. Stamp MemberId for attribution; do not key billing by UserId.
_Avoid_: Plan, personal User subscription; Stripe customer linkage on the User

**Trial**:
The unpaid `trialing` period of a Subscription. Length comes from the Plan's `freeTrial.days`. Stripe owns start and end; the local row stores trialStart / trialEnd.
_Avoid_: Plan, beta, Customer

**Tag**:
A polymorphic label attached to any resource type via taggings. Ownership is UserId (personal), MemberId (Member-owned), or organizationId (org-shared).
_Avoid_: Label, Category (unless the product truly means a separate taxonomy); a fourth ownership besides UserId, MemberId, and organizationId

**Conversation**:
Ordered UI transcript of AI turns. A turn is a Vercel AI SDK `UIMessage`. When persisted, it is the UI projection of a Thread. Ownership follows that Thread's resource.
_Avoid_: Chat (collides with the unused `chats` table, Chatwoot, and model category `"chat"`); Thread (that is the Mastra store)

**Thread**:
A Mastra Memory thread. `thread` is the Conversation id. `resource` is UserId (personal), MemberId (Member-owned), or organizationId (org-shared). Threads are unbound in Memory (not keyed by Agent). See [ADR-0007](docs/adr/0007-mastra-thread-over-chats.md).
_Avoid_: using Thread for the UI surface; the `chats` table

**Agent**:
A named Mastra agent the app registers. A Conversation selects which Agent answers; Agent is not the Thread key.
_Avoid_: Assistant, Bot, Model
