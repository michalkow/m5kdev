# AGENTS.md

## Scope

These instructions are critical for work in:

- `packages/backend/**`
- `apps/*/server/**`
- `apps/*/webapp/**`
- `packages/frontend/**`
- `packages/web-ui/**`

They define the default backend and frontend stack conventions for this monorepo.

## Architecture Intent

- Treat `@m5kdev/backend` as a composable backend stack, not a closed framework.
- Keep modules extensible and class-based.
- Keep composition explicit in app roots (`repository.ts`, `service.ts`, `trpc.ts`, server bootstrap).

## Module Structure

For server modules:

- Shared contracts live in `apps/*/shared/src/modules/<module>/` (`.constants.ts`, `.schema.ts`).
- Server implementation lives in `apps/*/server/src/modules/<module>/`:
  - `<module>.db.ts`
  - `<module>.dto.ts` (optional)
  - `<module>.repository.ts`
  - `<module>.service.ts`
  - `<module>.trpc.ts` and/or `<module>.router.ts`
  - `<module>.grants.ts` (if permissioned)
  - `<module>.jobs.ts` (if queued workflows)

## Layer Boundaries (Strict)

- Repository: persistence/query logic only.
- Service: business logic + orchestration only.
- Transport (`.trpc.ts`, `.router.ts`): input/auth/response wiring only; delegate to service.
- Jobs: worker glue that calls services.

Do not import services into repositories.

## Dependency Injection and Composition

- Services must declare explicit dependency maps:
  - `BaseService<{ ...repositories }, { ...services }>`
  - `BasePermissionService<{ ...repositories }, { ...services }>`
- Instantiate repositories in `apps/*/server/src/repository.ts`.
- Instantiate services in `apps/*/server/src/service.ts`.
- Prefer router factories or injected services over constructing repos/services inside router files.

## Permissions and Grants

- Keep grants in `<module>.grants.ts`.
- Keep checks in services with `accessGuard` / `accessGuardAsync`.
- Guard action names must exactly match grant action names.
- Prefer canonical actions: `read`, `write`, `delete`, `publish`.
- If a service does not actually enforce permissions, use `BaseService` instead of `BasePermissionService`.

## Transactions and DB Discipline

- Repository methods may accept optional `tx`.
- Inside transaction callbacks, use `tx` consistently.
- Do not mix `this.orm` queries with `tx` in the same transaction flow.
- Never create Drizzle migration files manually or automatically in-agent.
- When schema changes require migrations, stop and ask the user to run the project migration generation command.

## Result and Error Pattern

- Use `ServerResult` / `ServerResultAsync` and `neverthrow` (`ok`, `err`) consistently.
- Use `throwable` / `throwableAsync` in base classes.
- Prefer `this.error(...)` / `ServerError` for expected failures.
- In tRPC handlers, unwrap with `handleTRPCResult(...)`.

## Workflow/Jobs Rules

- Job payloads must be serializable and minimal (`userId`, ids, typed input).
- Avoid passing full request/session/context objects in queue payloads.
- Keep job modules thin; business rules belong in services.
- Avoid global singleton service imports inside jobs when an injected registry/factory is feasible.

## Do Not

- Do not put business logic in `.trpc.ts` or `.router.ts`.
- Do not perform cross-layer shortcuts (e.g., repository calling service).
- Do not use action aliases not present in grants (example: checking `"update"` when grants define only `"write"`).
- Do not hide module wiring in import-time side effects.

## Frontend Stack (Strict)

Frontend code in this repo is standardized around:

- `@heroui/react` for UI primitives.
- `react-router` v7 for routing.
- `nuqs` for URL query state.
- Tailwind CSS v4 for styling and design tokens.

Do not introduce alternate core libraries for these concerns without explicit request.

## Frontend Providers and App Shell

- Keep the app shell pattern: `NuqsAdapter` + `BrowserRouter` + `Providers`.
- Keep `HeroUIProvider` wired with router integration (`navigate` and `useHref`).
- Do not bypass `Providers` to mount feature-level global providers ad hoc.
- New global providers must be composed in `Providers.tsx`, not scattered across routes.

## Frontend Routing Rules

- Define route trees in app router files (example: `src/Router.tsx`) using `Routes`/`Route`.
- Keep protected-route logic centralized via route wrappers/components.
- Avoid adding alternate routing abstractions or a second router system.
- For reusable auth/billing route factories, keep integration at router composition level.

## URL State and Search Params

- Use `nuqs` parsers/hooks for query state (filters, sort, pagination, tabs, view mode).
- Do not manually parse/stringify query strings in components when `nuqs` can model it.
- Keep query key names stable and typed; avoid ad hoc one-off URL param contracts.

## HeroUI and Component Rules

- Prefer HeroUI components before raw HTML primitives when equivalent exists.
- Reuse shared components from `packages/web-ui` and `packages/frontend` before creating local duplicates.
- Keep app-level design tokens/theme changes in theme sources, not one-off per-component overrides.
- When extending component variants, use shared utility patterns (`cva`, `cn`) from repo utilities.

## Tailwind v4 and Theme Rules

- Use Tailwind utilities as the default styling approach.
- Keep Tailwind v4 setup centralized in app `index.css` (`@import`, `@plugin`, `@source`, `@theme`, `@layer`).
- Keep HeroUI theme/plugin config in `hero.ts` (or equivalent theme module), not inline in random files.
- Prefer token-based colors/spacing/radius over hardcoded values when a token exists.

## Frontend Data and UX Consistency

- Keep data fetching/mutations in existing query/trpc patterns used by the app.
- Keep loading/empty/error states explicit in route components.
- Invalidate/refetch queries intentionally after mutations; avoid broad cache resets by default.

## Frontend Do Not

- Do not use inline styles for routine styling when Tailwind utilities can express it.
- Do not introduce direct DOM manipulation for state that belongs in React/router/nuqs.
- Do not duplicate providers, auth guards, or routing logic inside feature components.
