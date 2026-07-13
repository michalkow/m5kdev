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
pnpm --filter ./apps/server sync
pnpm --filter ./apps/server seed
pnpm dev
```

The starter uses a local LibSQL file by default and writes local auth emails to `apps/server/.emails`.
Before running `drizzle-kit`, the starter generates `apps/server/src/generated/schema.ts` from the registered backend modules.

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
