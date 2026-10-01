# {{APP_NAME}}

{{APP_DESCRIPTION}}

## Workspace

- `apps/landing` contains the public marketing site (one page) and its Fly adapter.
// m5k:server:start
- `apps/shared` contains shared contracts, constants, and the product Deploy home (Dockerfile, `fly.toml`).
- `apps/server` contains the Express, Better Auth, Drizzle, and tRPC backend.
- `apps/email` contains the email templates and local delivery registry used by the starter.
// m5k:server:end
// m5k:webapp:start
- `apps/webapp` contains the Vite, React Router, HeroUI, and `nuqs` frontend.
// m5k:webapp:end
// m5k:expo:start
- `apps/expo` contains the Expo (React Native) client.
// m5k:expo:end

## Getting Started

```sh
pnpm install
pnpm dev
```
// m5k:server:start

Then migrate and seed the local database:

```sh
pnpm --filter ./apps/server drizzle:migrate
pnpm --filter ./apps/server drizzle:seed
```

The starter uses a local LibSQL file by default and writes local auth emails to `apps/server/.emails`.
Database tables are registered by hand in `apps/server/src/schema.ts`; after changing any `*.db.ts`, run `drizzle:generate` and `drizzle:migrate`.

## Demo Credentials

- Email: `admin@{{APP_SLUG}}.local`
- Password: `password1234`
// m5k:server:end

## Typical Commands

```sh
pnpm dev
pnpm build
pnpm check-types
pnpm lint
```

## Managed framework updates

This app records its generated baseline in `.m5kdev.json`. The updater is run
explicitly from the package registry and is not installed as an app dependency:

```sh
pnpm dlx create-m5kdev@<version> doctor
pnpm dlx create-m5kdev@<version> update --dry-run
pnpm dlx create-m5kdev@<version> update
```

Use an exact target version in CI and when coordinating an upgrade. Existing
projects without `.m5kdev.json` can enroll at their current compatible baseline
with `pnpm dlx create-m5kdev@<version> init`.

## Deploy (Fly.io)

The Dockerfile is the portable image. Fly is the adapter this starter ships —
`fly.toml` is ignored by `create-m5kdev update` so your app name and region stay
yours.

`.env*` files are excluded from the image. Copy the examples, then pass values
as Fly **build secrets** and **runtime secrets**.

```sh
cp apps/landing/.env.production.example apps/landing/.env.production
// m5k:server:start
cp apps/shared/.env.production.example apps/shared/.env.production
# fill in URLs, BETTER_AUTH_SECRET, REDIS_URL, …

fly apps create {{APP_SLUG}}-app
fly volumes create libsql_data --app {{APP_SLUG}}-app --region iad --size 1
pnpm app:secrets
pnpm app:deploy
// m5k:server:end
fly apps create {{APP_SLUG}}-landing
pnpm landing:secrets
pnpm landing:deploy
```

`landing:deploy` reads that app’s `.env.production` and forwards every key as
`fly deploy --build-secret` via Kernel bins (`m5kdev-fly-deploy` /
`m5kdev-fly-secrets`). A missing env file errors with a copy-the-example
message.
// m5k:server:start
`app:deploy` does the same for the product image. Product data lives on the
`libsql_data` volume at `/app/data` (`DATABASE_URL=file:/app/data/local.db`).
Redis is a runtime secret, not an image layer.
// m5k:server:end
