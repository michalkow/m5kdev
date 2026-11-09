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

The starter uses PostgreSQL through PgBouncer and writes local auth emails to `apps/server/.emails`. Start `docker compose -f apps/shared/compose.yaml up -d --build`, configure runtime `DATABASE_URL` and direct `DATABASE_DIRECT_URL`, and provision pgvector in `public` before migration/initialization.
Database tables are registered in `apps/server/src/schema.ts`; `src/drizzle.schema.ts` adds schema metadata for migration generation. After changing any `*.db.ts`, the maintainer runs `drizzle:generate`, reviews the output, then runs `drizzle:migrate`.
// m5k:ai:start
Run `pnpm --filter ./apps/server mastra:init` after migrations and before seed or runtime startup. App migrations own `app`; Mastra owns `mastra` and the embedding adapter owns `vectors`.
// m5k:ai:end

## Demo Credentials

- Email: `admin@{{APP_SLUG}}.local`
- Password: `password1234`

After sign-in, the index route (`/`) is the Posts list.
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
message. The wrapper also passes a cache key for public `VITE_*` values, so
configuration changes rebuild the frontend without invalidating dependency
installation. Direct Docker/Fly builds must supply `VITE_CONFIG_HASH` themselves.

Docker installs dependencies from manifests before copying source, and reuses
downloads through a BuildKit pnpm store cache. Keep pnpm overrides in
`pnpm-workspace.yaml`; root development tooling is excluded from the images.
If you add local workspace dependencies or install inputs such as patches, add
their files to the appropriate Docker stages. The landing runtime serves only
compiled assets with Caddy (`apps/landing/Caddyfile`), including SPA route fallback.
// m5k:server:start
`app:deploy` does the same for the product image. Provision provider-neutral
PostgreSQL with pgvector in `public` and a transaction-mode PgBouncer endpoint.
Set `DATABASE_URL` to the runtime pool and `DATABASE_DIRECT_URL` to the direct
database endpoint. App migrations own `app`; Mastra owns `mastra` and vectors
use `vectors`. Run reviewed app migrations and, when AI is selected, `mastra:init`
through direct connections before starting the server. Redis and database URLs
are server secrets, not image layers. The product `fly.toml` has no `[[mounts]]`:
PostgreSQL is hosted outside the Fly machine, so do not create a volume.
// m5k:server:end

## GitHub Actions deployment

Pushes to `main` deploy only the affected Fly app:

- `.github/workflows/deploy-landing.yml` deploys changes in `apps/landing/**`.
// m5k:server:start
- `.github/workflows/deploy-app.yml` deploys changes in `apps/server/**`,
  `apps/shared/**`, or `apps/email/**`.
// m5k:server:end
// m5k:webapp:start
  Changes in `apps/webapp/**` also deploy the product app, which serves the baked SPA.
// m5k:webapp:end

Root package, lockfile, workspace, `.npmrc`, and `.dockerignore` changes deploy
both available targets. Editing a workflow deploys its target. Each workflow
also has a **Run workflow** button in GitHub Actions; select `main`. Other
branches do not deploy. Deploys to each target run one at a time.

Before enabling deployment:

1. Run `pnpm install` and commit `pnpm-lock.yaml`; CI uses a frozen lockfile.
2. Create the Fly apps as shown above and commit their configured `fly.toml`
   files. Provision required services before the first deployment.
3. In GitHub **Settings → Secrets and variables → Actions**, add these
   repository secrets:

| Secret | Value |
| --- | --- |
| `FLY_API_TOKEN_LANDING` | App-scoped deploy token for `{{APP_SLUG}}-landing`. |
| `LANDING_ENV_PRODUCTION` | Complete contents of your filled-in `apps/landing/.env.production`. |
// m5k:server:start
| `FLY_API_TOKEN_APP` | App-scoped deploy token for `{{APP_SLUG}}-app`. |
| `APP_ENV_PRODUCTION` | Complete contents of your filled-in `apps/shared/.env.production`. |
// m5k:server:end

Create each token locally with `fly tokens create deploy --app <fly-app-name>`
and store the full output as its corresponding GitHub secret. See
[Fly's GitHub Actions setup](https://fly.io/docs/launch/continuous-deployment-with-github-actions/).
Use the actual Fly names if you customized `fly.toml`.

The workflows temporarily write the env files, import runtime secrets, then run
the existing deploy commands with build secrets and the public Vite cache key.
They remove the env files afterward; never commit production env files.
After changing a GitHub secret, manually run the affected workflow to apply it.
// m5k:server:start
Database migrations and optional Mastra initialization remain explicit operator
steps; the deploy workflow does not run them.
// m5k:server:end
