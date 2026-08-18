# {{APP_NAME}}

{{APP_DESCRIPTION}}

## Workspace

- `apps/shared` contains shared contracts, constants, and the product Deploy home (Dockerfile, `fly.toml`).
- `apps/server` contains the Express, Better Auth, Drizzle, and tRPC backend.
- `apps/webapp` contains the Vite, React Router, HeroUI, and `nuqs` frontend.
- `apps/landing` contains the public marketing site (one page) and its Fly adapter.
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
as Fly **build secrets** (baked into the SPA at image build) and **runtime
secrets** (`REDIS_URL`, `DATABASE_URL`, auth).

```sh
cp apps/shared/.env.production.example apps/shared/.env.production
cp apps/landing/.env.production.example apps/landing/.env.production
# fill in URLs, BETTER_AUTH_SECRET, REDIS_URL, …

fly apps create {{APP_SLUG}}-app
fly apps create {{APP_SLUG}}-landing
fly volumes create libsql_data --app {{APP_SLUG}}-app --region iad --size 1
pnpm app:secrets
pnpm landing:secrets
pnpm app:deploy
pnpm landing:deploy
```

`app:deploy` / `landing:deploy` read that app’s `.env.production` and forward
every key as `fly deploy --build-secret`. A missing env file errors with a
copy-the-example message. Product data lives on the `libsql_data` volume at
`/app/data` (`DATABASE_URL=file:/app/data/local.db`). Redis is a runtime secret,
not an image layer.
