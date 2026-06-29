# Server Module Structure Guide

Use this for modules in `apps/server/src/modules/**`.

## Preferred Module Layout

Shared contracts:

```
apps/shared/src/modules/<module>/
├── <module>.constants.ts
└── <module>.schema.ts
```

Server module:

```
apps/server/src/modules/<module>/
├── <module>.db.ts
├── <module>.repository.ts
├── <module>.service.ts
├── <module>.trpc.ts
└── <module>.module.ts
```

## Layer Boundaries

- Repositories own persistence and query construction.
- Services own business rules, orchestration, and context-aware defaults.
- tRPC files own transport only and must delegate to services.
- Register modules in `apps/server/src/app.ts`; use `db.ts` and `lib/auth.ts` only for scripts that need direct DB or auth access.

## Workflow, Redis, and push notifications

- `WorkflowModule` and `NotificationModule` are registered in `app.ts`. Start **Redis** locally (`REDIS_URL`) before `pnpm dev` on the server, or background jobs will not run.
- `index.ts` calls `builtBackendApp.start()` before listening and `builtBackendApp.shutdown()` on exit.
- After changing Drizzle tables, run `pnpm --filter ./apps/server sync` — do not hand-edit SQL migrations in this repo.

Push-related server env vars are documented in `apps/shared/.env.example`.
