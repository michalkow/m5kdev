# AGENTS.md

## About the Project

**{{APP_NAME}}** is a minimal app scaffolded for the m5kdev stack.

{{APP_DESCRIPTION}}

## Repository Structure

- `apps/shared` holds shared Zod schemas and constants.
- `apps/server` holds the backend composition root, modules, auth wiring, and database scripts.
- `apps/webapp` holds the React app shell, routes, providers, and the `posts` feature.
- `apps/email` holds the email templates used by auth flows and local email delivery.

## Backend Conventions

- Keep repository, service, and transport layers separate.
- Instantiate repositories in `apps/server/src/repository.ts`.
- Instantiate services in `apps/server/src/service.ts`.
- Keep tRPC files focused on input/output wiring and delegate logic to services.
- Do not create Drizzle migrations by hand. Use the scaffolded config and your project migration workflow later if you need generated migrations.

## Frontend Conventions

- Keep the app shell shape: `NuqsAdapter` + `BrowserRouter` + `Providers`.
- Compose global providers only in `apps/webapp/src/Providers.tsx`.
- Use `nuqs` for URL state, React Router for routing, HeroUI for UI primitives, and Tailwind v4 for styling.
- Prefer shared framework utilities from `@m5kdev/frontend` and `@m5kdev/web-ui` before adding local duplicates.
