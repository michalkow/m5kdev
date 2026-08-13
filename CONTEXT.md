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
_Avoid_: Permission, Policy, ACL, CASL statement (Access module is a different check)

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
`createBackendApp` — the composition root that wires libSQL/Drizzle, Redis, Better Auth, modules, tRPC, Express, startup, and shutdown.
_Avoid_: Framework (the stack is composable, not closed), App (that is the product)

**Backend Module**:
A `BaseModule` subclass (or `defineBackendModule` object) that contributes tables, repositories, services, tRPC fragments, Express hooks, and workflows. Registered in `apps/*/server/src/app.ts`.
_Avoid_: Package, Plugin, Feature (when you mean the server module)

**Shared contract**:
Zod schemas and constants in `apps/*/shared` or `@m5kdev/commons` that server and clients both import.
_Avoid_: DTO (server select/output helpers), types package, API spec

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
The shared list request: `page`, `limit`, `sort`, `order`, `filters`, `q`. On the Shared contract, `filters` is a list of QueryFilters.
_Avoid_: Search params (that is nuqs URL state)

**QueryFilter**:
A UI clause on a List query: `columnId`, `type`, `method`, and `value`.
_Avoid_: QueryMatch; Filter as the name of the List query

**QueryMatch**:
An object of List query predicates keyed by column, with comparison operators and `$and`/`$or` groups. Written in Services and Repositories; not part of the Shared contract. Distinct from QueryFilter; not a round-trip of it.
_Avoid_: Filter document, Mongo filter, Filter object, QueryFilter

**Starter**:
`apps/starter` — the reference product: `server`, `webapp`, `expo`, `email`, `e2e`, `shared`.
_Avoid_: Example, Template (CLI templates live in `packages/cli`)

### Product surfaces

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
