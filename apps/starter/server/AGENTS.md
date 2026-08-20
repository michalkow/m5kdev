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
- Register Core Modules and app modules in `apps/server/src/app.ts` via `createBackendApp(config, [modules])`. Do not use `backendApp.use`. Optional Backend Modules (`@m5kdev/module-*`) are not scaffolded; add them only when the product needs Clay, Docx, Pdf, Social, or Video.
- Database commands live in server `db.ts` (`pnpm drizzle:reset`, `drizzle:sync`, `drizzle:seed`) and call Kernel `runDb` — they must not import `app.ts`.

## Avoid Trivial Service Delegation

- Do not add service methods that merely call another service.
- Call the owning service directly unless the method adds a business rule, authorization, validation, orchestration, a transaction boundary, or meaningful domain translation.
- Renaming a dependency method, repackaging arguments, constructing a prompt, or forwarding actor/context data alone does not justify a wrapper.
- If removing the method and calling the dependency directly would lose no behavior or boundary, do not add it.

## Runtime notes

// m5k:workflows:start
- `WorkflowModule` is registered in `app.ts`. Start **Redis** locally (`REDIS_URL`) before `pnpm dev` on the server, or background jobs will not run.
// m5k:workflows:end
- `index.ts` calls `builtBackendApp.start()`, which listens and handles SIGINT/SIGTERM. Extra shutdown work (telemetry) is `onShutdown` on `createBackendApp`.
- After changing Drizzle tables, run `pnpm --filter ./apps/server drizzle:generate` then `drizzle:migrate` — do not hand-edit SQL migrations in this repo.

// m5k:notifications:start
- `NotificationModule` is registered in `app.ts` when this feature is selected. Push-related server env vars are documented in `apps/shared/.env.example`.
// m5k:notifications:end
