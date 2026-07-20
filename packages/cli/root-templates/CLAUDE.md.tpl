# CLAUDE.md

Guidance for Claude Code when working in this repository.

## About This App

**{{APP_NAME}}** — {{APP_DESCRIPTION}}

This is a pnpm + Turborepo monorepo built on the **m5kdev framework**:

- `@m5kdev/backend` — backend kernel: Express, Better Auth, Drizzle (LibSQL), and tRPC. Apps compose it via `createBackendApp(config, [modules])`.
- `@m5kdev/commons` — shared runtime utilities and contracts.
- `@m5kdev/config` — configuration loading and validation.
- `@m5kdev/email` — email rendering and local delivery used by auth flows.
// m5k:webapp:start
- `@m5kdev/frontend` — framework-level React providers (`AppConfigProvider`, `AppTrpcQueryProvider`) and hooks.
- `@m5kdev/web-ui` — web UI components built on HeroUI v3.
// m5k:webapp:end

The framework owns the plumbing (auth, database wiring, tRPC composition, permissions); app code supplies modules and screens that follow the conventions below.

## Workspace

- `apps/shared` — shared Zod schemas, constants, and the `.env` file every app reads.
- `apps/server` — backend composition root (`src/app.ts`), app modules (`src/modules/`), hand-registered table list (`src/schema.ts`), and Drizzle scripts.
// m5k:webapp:start
- `apps/webapp` — Vite + React 19 frontend: app shell, routes, providers, and feature modules.
// m5k:webapp:end
// m5k:expo:start
- `apps/expo` — Expo (React Native) app sharing the same server and shared contracts.
// m5k:expo:end
- `apps/email` — email templates and the local delivery registry.
// m5k:test-harness:start
- `apps/e2e` — Playwright end-to-end tests; the server exposes a test-harness module for them.
// m5k:test-harness:end

## Commands

```sh
pnpm dev          # run all apps in dev (turbo)
pnpm build        # build all apps
pnpm lint         # biome check
pnpm lint:fix     # biome check --write
pnpm check-types  # tsc --noEmit everywhere
```

Database (Drizzle, run from the repo root):

```sh
pnpm --filter ./apps/server drizzle:generate  # generate migrations from *.db.ts changes
pnpm --filter ./apps/server drizzle:migrate   # apply migrations
pnpm --filter ./apps/server drizzle:seed      # seed the local database
pnpm --filter ./apps/server drizzle:reset     # reset the local database
pnpm --filter ./apps/server drizzle:studio    # inspect the database
```

First-time setup: `pnpm install`, then `drizzle:migrate` and `drizzle:seed`, then `pnpm dev`.
// m5k:test-harness:start

End-to-end tests: `pnpm --filter ./apps/e2e test:e2e` (Playwright).
// m5k:test-harness:end

The local database is a LibSQL file; local auth emails are written to `apps/server/.emails`. Demo login: `admin@{{APP_SLUG}}.local` / `password1234`.

## Framework Architecture

### Backend: kernel + modules

The backend kernel orchestrates modules. Each app module is a `BaseModule` subclass registered in `apps/server/src/app.ts` via `createBackendApp(config, [modules])` — the kernel wires its repositories, services, and tRPC routers.

A module lives in `apps/server/src/modules/<name>/` and follows a strict file anatomy where **the Drizzle table is the source of truth** and types flow one way:

```
<name>.db.ts          table definition (source of truth; register it in src/schema.ts)
  └─ <name>.dto.ts    Zod schemas derived from the table — the module's API surface
       ├─ <name>.repository.ts   data access, consumes the DTO object
       ├─ <name>.service.ts      business logic, consumes the DTO object
       └─ <name>.trpc.ts         thin router: attaches DTO schemas, delegates to the service
<name>.grants.ts      permission grants for the module
<name>.module.ts      composition unit wiring the above into one class
```

Clients infer all row/list types from `AppRouter` (`inferRouterOutputs`) — never hand-mirror server types anywhere. Never write Drizzle migrations by hand; change `*.db.ts`, register new tables in `src/schema.ts`, then run `drizzle:generate` + `drizzle:migrate`.

Roles are defined in `apps/shared/src/modules/app/` and passed through both `createBackendApp` metadata and the frontend config provider; when adding roles, extend the module `*.grants.ts` files to match.
// m5k:webapp:start

### Frontend: fixed stack, hooks own the logic

The webapp stack is fixed — React 19, HeroUI v3, Tailwind CSS v4, react-router v7, `nuqs` for URL state, TanStack Query over tRPC, i18next. Do not introduce alternatives (no fetch/axios, no form libraries, no other UI kits).

- App shell shape: `NuqsAdapter` + `BrowserRouter` + `Providers`; global providers are composed in one place only.
- Components stay display-focused; data fetching, mutations, and effect chains live in custom hooks under `modules/<feature>/hooks/`, composed into one screen-level hook (e.g. `usePostsRoute`).
- All server data goes through `useTRPC()` + `queryOptions`/`mutationOptions`; invalidate with the matching `queryFilter()` after mutations.
- Forms are uncontrolled HeroUI `Form` components with native HTML validation; read values from `FormData` on submit.
- All user-facing copy goes through i18next; keys live in `apps/webapp/translations/`.
// m5k:webapp:end

### Reference implementation

The **posts** feature is the canonical example of every convention. When adding a feature, mirror its structure:

- `apps/shared/src/modules/posts/`
- `apps/server/src/modules/posts/`
// m5k:webapp:start
- `apps/webapp/src/modules/posts/`
// m5k:webapp:end

## Detailed Style Guides

The framework's detailed conventions live in `.cursor/rules/*.mdc`. Cursor applies them by glob automatically; Claude does not — so **before creating or editing a file that matches a pattern below, read the matching guide first**. They describe how the framework is meant to be used, with correct/incorrect examples.

| Guide | Read before touching |
| --- | --- |
| `.cursor/rules/module-db-guide.mdc` | `apps/server/src/modules/**/*.db.ts` |
| `.cursor/rules/module-dto-guide.mdc` | `apps/server/src/modules/**/*.dto.ts` |
| `.cursor/rules/module-repository-guide.mdc` | `apps/server/src/modules/**/*.repository.ts` |
| `.cursor/rules/module-service-guide.mdc` | `apps/server/src/modules/**/*.service.ts` |
| `.cursor/rules/module-trpc-guide.mdc` | `apps/server/src/modules/**/*.trpc.ts` |
| `.cursor/rules/module-grants-guide.mdc` | `apps/server/src/modules/**/*.grants.ts` |
| `.cursor/rules/module-module-guide.mdc` | `apps/server/src/modules/**/*.module.ts` |
| `.cursor/rules/module-schema-guide.mdc` | `apps/shared/src/modules/**/*.schema.ts` |
// m5k:webapp:start
| `.cursor/rules/frontend-component-guide.mdc` | webapp `*.tsx` components |
| `.cursor/rules/frontend-hook-guide.mdc` | webapp `hooks/**` |
| `.cursor/rules/frontend-data-guide.mdc` | webapp data fetching / tRPC usage |
| `.cursor/rules/frontend-form-guide.mdc` | webapp forms |
| `.cursor/rules/frontend-i18n-guide.mdc` | webapp user-facing copy |
// m5k:webapp:end

`AGENTS.md` (repo root and per-app) carries a compact summary of the same conventions for other agents; this file plus the guides above are the authoritative version for Claude.
