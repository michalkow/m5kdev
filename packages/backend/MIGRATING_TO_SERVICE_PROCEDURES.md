# Migrating To Service Procedures

This guide documents the migration pattern implied by:

- `0bf3434` on March 29, 2026: actor management and request-context validation
- `cf56b9c` on March 30, 2026: service refactors to use actors and service procedures

It is intended for apps built on `@m5kdev/backend` that still expose request-bound service methods as ad hoc `async` functions.

## Why This Migration Exists

The backend now has a first-class procedure builder on `BaseService` and `BasePermissionService`. The goal is to move request concerns into the service layer in a structured way:

- auth requirements live in the service method definition
- permission checks live in the service method definition
- query scoping lives in the service method definition
- routers stay thin and only do transport wiring
- services consume `ctx.actor` instead of reading scattered `ctx.user` / `ctx.session` fields

This matches the repo architecture rules:

- router/trpc files handle input/auth/response wiring only
- service files contain business logic and orchestration
- repositories stay persistence-only

## What Changed In The Last Two Commits

### 1. Request context now carries an actor

`createAuthContext(...)` now builds a `RequestContext` with:

- `user`
- `session`
- `actor`

`actor` is the normalized authorization identity used by services and grants. A protected request always starts with a user-scoped actor. Organization and team actors are derived when a broader scope is required.

### 2. tRPC helpers now narrow context explicitly

Protected and admin procedures should pass verified context forward:

```ts
export const procedure = t.procedure.use(({ ctx, next }) => {
  return next({ ctx: verifyProtectedProcedureContext(ctx) });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  return next({ ctx: verifyAdminProcedureContext(ctx) });
});
```

This means service entrypoints can rely on an authenticated `ctx.actor` once the router uses the standard helpers.

### 3. Service methods can now be declared as procedures

Instead of:

```ts
async list(input, ctx) { ... }
```

you can now declare:

```ts
readonly list = this.procedure<Input>("moduleList")
  .requireAuth()
  .handle(({ input, ctx }) => { ... });
```

The builder supports:

- `.requireAuth()`
- `.requireAuth("organization")`
- `.requireAuth("team")`
- `.addContextFilter([...])`
- `.use(stepName, step)`
- `.mapInput(stepName, mapper)`
- `.access(...)` on `BasePermissionService`

## Migration Rules

### Migrate these methods to procedures

Convert service methods that are:

- called directly from tRPC handlers
- request-scoped
- dependent on authenticated user, organization, or team context
- enforcing grants
- adding context-derived filters to query input

Examples from the recent commits:

- `WorkflowService.read`
- `WorkflowService.list`
- `ConnectService.list`
- `ConnectService.delete`
- `RecurrenceService.create`

### Keep these methods as plain methods

Do not force everything into a procedure. Keep plain `async` methods when they are:

- webhook handlers
- OAuth callbacks
- queue/job helpers
- internal orchestration helpers
- methods that are not request-bound

Examples from the recent commits:

- `ConnectService.startAuth`
- `ConnectService.handleCallback`
- `ConnectService.refreshToken`
- billing webhook-related methods

## Migration Checklist

### 1. Update router context wiring

Make sure your app-level tRPC utilities use the backend helpers:

```ts
import {
  type createAuthContext,
  verifyAdminProcedureContext,
  verifyProtectedProcedureContext,
} from "@m5kdev/backend/utils/trpc";

type Context = Awaited<ReturnType<ReturnType<typeof createAuthContext>>>;

const t = initTRPC.context<Context>().create({ transformer });

export const procedure = t.procedure.use(({ ctx, next }) => {
  return next({ ctx: verifyProtectedProcedureContext(ctx) });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  return next({ ctx: verifyAdminProcedureContext(ctx) });
});
```

If you skip this step, service procedures that call `.requireAuth()` or `.addContextFilter()` will fail because `ctx.actor` will not be guaranteed.

### 2. Convert request-bound service methods to `readonly` procedures

Before:

```ts
async list(input: WorkflowListInputSchema, { user }: { user: User }) {
  return this.repository.workflow.list({ ...input, userId: user.id });
}
```

After:

```ts
readonly list = this.procedure<WorkflowListInputSchema>("workflowList")
  .requireAuth()
  .handle(({ input, ctx }) => {
    return this.repository.workflow.list({ ...input, userId: ctx.actor.userId });
  });
```

Guidelines:

- use `readonly <name> = ...`
- use a stable procedure name string such as `"workflowList"` or `"connectDelete"`
- keep repository access inside `.handle(...)`
- keep any preloading or transformation in `.use(...)` / `.mapInput(...)`

### 3. Replace raw user/session access with `ctx.actor` where possible

Old pattern:

- `ctx.user.id`
- `ctx.session.activeOrganizationId`
- `ctx.session.activeTeamId`

New pattern for authorization identity:

- `ctx.actor.userId`
- `ctx.actor.organizationId`
- `ctx.actor.teamId`

Use `ctx.user` only for fields that are not part of the actor, for example `stripeCustomerId`, email, or profile fields.

`BillingService.listInvoices` is the right model here:

- authorization identity comes from `ctx.actor.userId`
- billing metadata still comes from `ctx.user.stripeCustomerId`

### 4. Use `addContextFilter(...)` for scoped query endpoints

If a method accepts `QueryInput` and should be restricted by the authenticated actor, prefer:

```ts
readonly list = this.procedure<QueryInput>("list")
  .addContextFilter(["user", "organization"])
  .handle(({ input }) => this.repository.recurrence.queryList(input));
```

Notes:

- `.addContextFilter()` automatically requires auth
- the required actor scope is inferred from the requested filters
- `["organization"]` requires an organization actor
- `["team"]` requires a team actor

Use `.mapInput(...)` instead when you need custom column mappings.

### 5. Use `.access(...)` in permission services

If the service extends `BasePermissionService`, move grant checks into the procedure chain.

Entity loaded in a prior step:

```ts
readonly update = this.procedure<PostUpdateInputSchema>("update")
  .requireAuth()
  .use("post", async ({ input }) => {
    return this.repository.posts.findById(input.id);
  })
  .access({
    action: "write",
    entityStep: "post",
  })
  .handle(({ input }) => {
    return this.repository.posts.update(input);
  });
```

Computed entity inline:

```ts
.access({
  action: "write",
  entities: ({ ctx }) => ({
    organizationId: ctx.actor.organizationId,
    teamId: ctx.actor.teamId,
  }),
})
```

Keep action names aligned with grants. Use canonical names such as `read`, `write`, `delete`, and `publish`.

### 6. Keep routers thin

After migration, routers should mostly do three things:

- validate input/output
- provide verified context
- unwrap `ServerResult` with `handleTRPCResult(...)`

Example:

```ts
list: procedure
  .input(workflowListInputSchema)
  .output(workflowListOutputSchema)
  .query(async ({ ctx, input }) => {
    return handleTRPCResult(await workflowService.list(input, ctx));
  }),
```

Do not reintroduce business logic into `.trpc.ts` while migrating.

## Patterns From The Recent Commits

### Straight conversion: plain method to procedure

Use this for endpoints like `WorkflowService.read/list` and `ConnectService.list/delete`.

- move auth into `.requireAuth()`
- switch to `ctx.actor`
- keep repository call in `.handle(...)`

### Context-scoped creation

Use this for endpoints like `RecurrenceService.create`.

- require auth
- derive ownership fields from `ctx.actor`
- persist `userId`, `organizationId`, and `teamId` from one normalized source

### Mixed migration is acceptable

Not every method has to move in one pass. The recent commits show a mixed state:

- some request-bound methods were converted to procedures
- some services only switched from `ctx.user`/`ctx.session` to `ctx.actor`
- some non-request methods remained plain methods

That is an acceptable migration path. Prioritize tRPC-facing methods first.

### Broader scopes outside procedures

If you are in a plain method and need organization or team scope, derive it explicitly:

```ts
const actor = createActorFromContext({ user: ctx.user, session: ctx.session }, "organization");
```

That is the pattern used in `AuthService` for organization-scoped operations that were not converted to procedures in the same commit.

## Recommended Order For Downstream Projects

1. Upgrade to a version that includes the actor-aware tRPC helpers and service procedure builder.
2. Update your app-level `utils/trpc.ts` wiring first.
3. Convert simple read/list endpoints to procedures.
4. Convert write endpoints that only need `.requireAuth()`.
5. Convert permissioned endpoints to `BasePermissionService` procedures with `.access(...)`.
6. Migrate query endpoints to `.addContextFilter(...)` or `.mapInput(...)`.
7. Leave webhooks, jobs, and callback flows as plain methods unless there is a strong reason to wrap them.

## Review Checklist After Migration

- protected procedures pass `verifyProtectedProcedureContext(ctx)` into `next`
- admin procedures pass `verifyAdminProcedureContext(ctx)` into `next`
- request-bound service entrypoints are `readonly` procedures
- service code uses `ctx.actor` for authorization identity
- organization/team checks use actor scope, not ad hoc session checks
- permissioned services use `.access(...)` with canonical action names
- routers contain no business logic
- repositories still contain no service or transport logic

## A Good Target State

After migration, a typical module should look like this:

- router validates input/output and forwards `ctx`
- service exposes `readonly` procedures for request entrypoints
- procedure chain handles auth, scoping, and grants
- handler contains business logic only
- repository stays focused on persistence

That is the direction established by the March 29-30, 2026 changes.
