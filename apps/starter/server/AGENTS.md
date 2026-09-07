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
// m5k:mcp:start
├── <module>.mcp.ts
// m5k:mcp:end
└── <module>.module.ts
```

## Layer Boundaries

- Repositories own persistence and query construction.
- Services own business rules, orchestration, and context-aware defaults.
- tRPC files own transport only and must delegate to services.
// m5k:mcp:start
- MCP call maps live in `<module>.mcp.ts` and are contributed from `mcp()` / `mcpUser()`. Delegate to Procedures or unguarded service methods; do not scrape Service properties.
// m5k:mcp:end
- Register Core Modules and app modules in `apps/server/src/app.ts` via `createBackendApp(config, [modules])`. Do not use `backendApp.use`. Optional Backend Modules (`@m5kdev/module-*`) are not scaffolded; add them only when the product needs Clay, Docx, Pdf, Social, or Video.
// m5k:ai:start
- `AIModule` is registered in `app.ts` with an app-owned Mastra Agent (`assistant`). Conversation HTTP lives on `/ai`. Set `OPENROUTER_API_KEY` for live replies. Do not add a Starter service wrapper around `AIService` chat.
// m5k:ai:end
- Database commands live in server `db.ts` (`pnpm drizzle:reset`, `drizzle:sync`, `drizzle:seed`) and call Kernel `runDb` — they must not import `app.ts`.

## Avoid Trivial Service Delegation

- Do not add service methods that merely call another service.
- Call the owning service directly unless the method adds a business rule, authorization, validation, orchestration, a transaction boundary, or meaningful domain translation.
- Renaming a dependency method, repackaging arguments, constructing a prompt, or forwarding actor/context data alone does not justify a wrapper.
- If removing the method and calling the dependency directly would lose no behavior or boundary, do not add it.

## Runtime notes

// m5k:workflows:start
- `WorkflowModule` is registered in `app.ts`. Start **Redis** locally (`REDIS_URL`) before `pnpm dev` on the server, or background jobs will not run.
- Server event: emit through Auth from a job `.handle` when the UI must refresh a change the trigger mutation did not return. See `.cursor/rules/server-event-emit.mdc`.
// m5k:workflows:end
- `index.ts` calls `builtBackendApp.start()`, which listens and handles SIGINT/SIGTERM. Extra shutdown work (telemetry) is `onShutdown` on `createBackendApp`.
- After changing Drizzle tables, run `pnpm --filter ./apps/server drizzle:generate` then `drizzle:migrate` — do not hand-edit SQL migrations in this repo.

// m5k:mcp:start
- `McpModule` is registered in `app.ts`. MCP clients authenticate with Better Auth MCP OAuth (not API keys). Compose `auth.oauth.db` plus `mcpAllowlistEntries`. Contribute Organization-scoped calls from `posts.mcp.ts`. Omit the module to disable MCP.
// m5k:mcp:end

// m5k:notifications:start
- `NotificationModule` is registered in `app.ts` when this feature is selected. Push-related server env vars are documented in `apps/shared/.env.example`.
// m5k:notifications:end
