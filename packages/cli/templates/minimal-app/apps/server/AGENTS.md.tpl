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
└── <module>.trpc.ts
```

## Layer Boundaries

- Repositories own persistence and query construction.
- Services own business rules, orchestration, and context-aware defaults.
- tRPC files own transport only and must delegate to services.
- Keep composition explicit in `db.ts`, `repository.ts`, `service.ts`, and `trpc.ts`.

## Workflow, Redis, and push notifications

- `workflow.ts` wires BullMQ via **Redis** (`REDIS_URL`). Start Redis locally before `pnpm dev` on the server, or jobs will not run.
- `index.ts` calls `workflowRegistry.registerService(notificationService)` and `await workflowRegistry.start()` before listening.
- After changing Drizzle tables (including `notification_*` tables merged in `db.ts`), run your project’s **Drizzle generate / migrate** command — do not hand-edit SQL migrations in this repo.

Push-related server env vars are documented in `apps/shared/.env.example`.
