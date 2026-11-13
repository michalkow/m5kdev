# AGENTS.md

## About the Project

**{{APP_NAME}}** is an app scaffolded for the m5kdev stack.

{{APP_DESCRIPTION}}

## Project North Star

Before planning or changing the app, read root `PROJECT.md` when it exists.
It describes why this project exists, its intended function and experience,
and the priorities that make it successful. Treat it as the North Star for
judging changes, rather than an architecture or implementation plan.

If a proposed change conflicts with those priorities, call out the conflict
and its trade-off before making changes. For example, extra response latency
may undermine a narrative game's goal of fast, fun gameplay even if the change
is technically sound. The North Star provides context, not authorization for
unrelated work or Production operations. If it is absent, continue with the
task's stated goals; do not invent a North Star or require a new file.

## Repository Structure

- `apps/landing` holds the public one-page site and its Fly adapter.
- `apps/docs` holds public product help; hosting is configured when scaffolding.
// m5k:server:start
- `apps/shared` holds shared Zod schemas, constants, and the product Deploy home.
- `apps/server` holds the backend composition root, modules, auth wiring, and database scripts.
- `apps/email` holds email templates used by auth flows and local email delivery.
// m5k:server:end
// m5k:webapp:start
- `apps/webapp` holds the React app shell, routes, providers, and the `posts` feature.
// m5k:webapp:end
// m5k:expo:start
- `apps/expo` holds the Expo (React Native) client.
// m5k:expo:end
// m5k:test-harness:start
- `apps/e2e` holds Playwright end-to-end tests.
// m5k:test-harness:end

## Working with m5kdev

When stack behavior is unclear or a problem appears to come from m5kdev,
inspect its source for this app's installed version. Prefer an accessible local
checkout (for example, `/Users/michalkow/Projects/m5kdev` on the maintainer's
machine); that example path is optional, not a required location. Otherwise use
https://github.com/michalkow/m5kdev, selecting the corresponding release rather
than assuming the default branch matches this app.

If the task needs an upstream fix and access permits, work in that checkout
and submit an upstream PR, following its own instructions and checks. Keep the
app's integration compatible with its installed release until the fix is available.

## Production operations

Deploying the Production app or migrating its database requires explicit user
instruction for that operation. A request to implement a feature, fix a bug,
or open a PR does not grant that authority.
// m5k:env-canary:start
This also applies to Canary operations that migrate or otherwise change the
Production database.
// m5k:env-canary:end

// m5k:server:start
## Modules and layers

`posts` is the reference module. Mirror its layout when adding a feature:

- `apps/shared/src/modules/posts/`
- `apps/server/src/modules/posts/`
// m5k:webapp:start
- `apps/webapp/src/modules/posts/`
// m5k:webapp:end

- The Drizzle table is the source of truth; DTO Zod schemas derive from it. Repositories own persistence; services own business rules and orchestration; transports attach input/auth/response wiring and delegate to services; jobs call services.
- Compose modules explicitly with `createBackendApp(config, [modules])` in `apps/server/src/app.ts`. Import Kernel infrastructure from `@m5kdev/backend/base/*`; Base is not a module to register. Optional Backend Modules (`@m5kdev/module-*`) are added only when needed.
- Services declare explicit repository/service dependency maps with `BaseService` or `BasePermissionService`. Keep Grant checks in services; action names match grants (`read`, `write`, `delete`, `publish`).
- Use `ServerResult` / `ServerResultAsync` and neverthrow consistently; unwrap transport results with `handleTRPCResult`.
- Clients infer server types from `AppRouter` (`inferRouterOutputs`); shared contracts do not mirror server row/output types.
- Roles live in `apps/shared/src/modules/app/` and pass through `createBackendApp` metadata and the frontend config provider. Extend module grants when adding roles.

## Database migrations

Generate migrations with `drizzle:generate` and apply them to the local or
Development database with `drizzle:migrate` without asking for confirmation.
Use the app's scripts, for example `pnpm --filter ./apps/server drizzle:generate`.
Never hand-write or edit migration SQL, journal entries, or snapshots; never use
`generate --custom`. Stop and ask if drizzle-kit prompts about a rename.
Read `docs/agents/database-migrations.md` before changing a table or migration
history: it covers frozen migrations, Production compatibility, and expand/contract.

Runtime uses PostgreSQL through PgBouncer (`DATABASE_URL`); migrations and
initialization require `DATABASE_DIRECT_URL`. Keep app, Mastra, and vector
schemas separately owned. Database commands live in server `db.ts`, without
booting the HTTP app. First-time setup: install dependencies, start the local
PostgreSQL/PgBouncer stack and provision pgvector, then migrate, seed, and run
`pnpm dev`. Local auth emails appear in `apps/server/.emails`; demo login is
`admin@{{APP_SLUG}}.local` / `password1234`.

A disposable Development database that drifted may be rebuilt with
`drizzle:rebuild` followed by `drizzle:seed`, after declaring it disposable with
`DATABASE_DISPOSABLE=true`. Permission to generate/apply migrations does not
authorize destructive resets of data that has not been declared disposable.

## Deployment environments

Development (`main`) and Production (`production`) deploy from GitHub Actions
on merge. Feature PRs target `main` only; read `APP_ENV`, never `NODE_ENV`, to
decide environment-specific behavior. Production migrations run through the
deploy workflow, with the explicit user instruction required above.
Read `docs/agents/environments.md` before changing configuration, jobs, or
deploy files; human setup is in `docs/deployment.md`.
// m5k:server:end

// m5k:webapp:start
## Frontend

Use React 19, HeroUI v3, Tailwind CSS v4, react-router v7, `nuqs`, TanStack Query
over tRPC, and i18next. Keep `NuqsAdapter` + `BrowserRouter` + `Providers` as the
app shell; compose global providers only in `Providers.tsx` (HeroUI v3 has no
`HeroUIProvider`). Keep routing in `Router.tsx` and logic in feature hooks.
Use `useTRPC()` + `queryOptions`/`mutationOptions`, with targeted `queryFilter()`
invalidation. Use uncontrolled HeroUI forms, native validation, and `FormData`.
Put all user-facing copy through i18next; reuse framework UI and translations.
// m5k:webapp:end

## Product documentation

Maintain guides and navigation in every configured app locale, including regional
variants, whenever user-facing behavior or supported locales change.

Before completing a task that adds, changes, or removes user-facing behavior,
update the affected end-user guides in `apps/docs/docs/` in the same change.
Read `docs/agents/product-documentation.md` for audience, content, and verification rules.

## Agent skills

Assume the required skills from https://github.com/michalkow/skills are globally
installed. Use the applicable skill before editing; the scaffold supplies
repository context rather than installing local copies of skills or editor rules.
// m5k:server:start

| Skill | Use when editing |
| --- | --- |
| `rule-module-db` | Drizzle tables (`*.db.ts`) |
| `rule-module-dto` | DTO schemas (`*.dto.ts`) |
| `rule-module-repository` | Persistence/query logic (`*.repository.ts`) |
| `rule-module-service` | Business logic (`*.service.ts`) |
| `rule-module-prompt` | AI prompt factories (`*.prompt.ts`) |
| `rule-module-trpc` | tRPC transports (`*.trpc.ts`) |
| `rule-module-grants` | Permission grants and checks (`*.grants.ts`) |
| `rule-module-module` | Module composition (`*.module.ts`) |
| `rule-module-schema` | Shared Zod contracts (`*.schema.ts`) |
| `rule-server-event-emit` | Background completions and Server event subscriptions |
// m5k:server:end
// m5k:webapp:start
| `rule-frontend-component` | React components (`*.tsx`) |
| `rule-frontend-hook` | Feature hooks, queries, mutations, URL state, or effects |
| `rule-frontend-data` | tRPC/TanStack Query data fetching and mutations |
| `rule-frontend-form` | Forms |
| `rule-frontend-i18n` | User-facing text and translations |
// m5k:webapp:end

### Issue tracker

Issues live in GitHub Issues. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
