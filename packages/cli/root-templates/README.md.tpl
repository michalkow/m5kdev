# {{APP_NAME}}

{{APP_DESCRIPTION}}

## Workspace

- `apps/shared` contains shared contracts and constants for the app.
- `apps/server` contains the Express, Better Auth, Drizzle, and tRPC backend.
- `apps/webapp` contains the Vite, React Router, HeroUI, and `nuqs` frontend.
- `apps/email` contains the email templates and local delivery registry used by the starter.

## Getting Started

```sh
pnpm install
pnpm --filter ./apps/server drizzle:migrate
pnpm --filter ./apps/server drizzle:seed
pnpm dev
```

The starter uses a local LibSQL file by default and writes local auth emails to `apps/server/.emails`.
Database tables are registered by hand in `apps/server/src/schema.ts`; after changing any `*.db.ts`, run `drizzle:generate` and `drizzle:migrate`.

## Demo Credentials

- Email: `admin@{{APP_SLUG}}.local`
- Password: `password1234`

## Typical Commands

```sh
pnpm dev
pnpm build
pnpm check-types
pnpm lint
```
