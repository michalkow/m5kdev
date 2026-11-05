---
sidebar_position: 8
---

# Deploy with Docker and Fly.io

The **Dockerfile** is the portable artifact: any host that can build from the
repo root can run it. **Fly.io** is the adapter this starter ships (`fly.toml`,
`app:deploy` / `landing:deploy`). Other hosts are not documented as shipped.

Generated apps need **Node.js >= 24**. Images use `node:24-slim` and pnpm from
`packageManager` (`pnpm@10.13.1`).

Root scripts call Kernel bins (`m5kdev-fly-deploy` / `m5kdev-fly-secrets` from
`@m5kdev/backend`). The app only passes `--config`, `--dockerfile`, and `--env`
paths. The `fly` CLI must be on PATH.

## What ships

| App | Image | Fly name | Volume |
| --- | --- | --- | --- |
| Product (server + baked webapp) | `apps/shared/Dockerfile` | `<app-slug>-app` in new apps | none; externally hosted PostgreSQL |
| Landing (public site) | `apps/landing/Dockerfile` | `<app-slug>-landing` | none |

The starter uses **one** root `.dockerignore` for both images. Its recursive
patterns exclude environment files, dependencies, local databases, build
outputs, and test reports at every workspace depth. A plain `.dockerignore`
beside a Dockerfile does not apply to a repository-root build context.

The Kernel serves the baked SPA when `createBackendApp` is given
`spa: { root: "./client" }` and that directory exists. Local Vite on port 5173
is unchanged: there is no `./client` directory, so the Kernel skips the SPA.

## Build secrets vs runtime secrets

`.env*` stays out of the image (root `.dockerignore`).

- **Build secrets** — forwarded by `app:deploy` / `landing:deploy` as
  `fly deploy --build-secret` for **every** key in that app’s `.env.production`.
  The frontend build mounts them with `required=false` so a dry run without
  secrets still builds. Vite `VITE_*` values are baked into the SPA at image
  build.
- The deploy wrapper also supplies `VITE_CONFIG_HASH`, a stable SHA-256 hash of
  sorted `VITE_*` keys and values. Docker does not invalidate secret mounts when
  their contents change; this argument ensures the baked frontend updates when
  public configuration changes. Runtime-only secret changes do not rebuild it.
  When invoking Docker or Fly directly, supply
  `--build-arg VITE_CONFIG_HASH=<hash-of-public-VITE-values>` alongside the build
  secrets, and change the hash whenever a public value is added, removed, or
  changed. Keep private runtime values out of build arguments.
- **Runtime secrets** — `pnpm app:secrets` / `pnpm landing:secrets` import the
  same file (`fly secrets import`). Use this for `REDIS_URL`, `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, and anything the Node process reads after boot.

Copy the examples first. A missing `.env.production` errors with a
copy-the-example message.

```sh
cp apps/shared/.env.production.example apps/shared/.env.production
cp apps/landing/.env.production.example apps/landing/.env.production
```

Product examples require a PostgreSQL `DATABASE_URL` routed through PgBouncer
for runtime and a separate `DATABASE_DIRECT_URL` for migration/provisioning jobs.
They also document `REDIS_URL`. Use one database per app/environment with
separately owned `app`, `mastra`, and `vectors` schemas. No local database volume
is required. Keep the direct connection secret out of frontend values.

## First deploy

```sh
fly apps create <app-slug>-app
fly apps create <app-slug>-landing
pnpm app:secrets
pnpm landing:secrets
pnpm app:deploy
pnpm landing:deploy
```

Default Fly region in the starter is `iad`, 1gb shared CPU, `PORT=8080`,
`force_https`, `min_machines_running = 0`.

## GitHub Actions deployment

Generated repositories include two independent workflows for pushes to `main`:

| Workflow | App changes that trigger deployment |
| --- | --- |
| `.github/workflows/deploy-landing.yml` | `apps/landing/**` |
| `.github/workflows/deploy-app.yml` | `apps/server/**`, `apps/webapp/**`, `apps/shared/**`, `apps/email/**` |

Landing-only projects omit the product workflow. Expo-only projects keep the
product workflow for their backend and omit the webapp path. Native Expo builds
are not deployed by these workflows.

Changes to root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`,
or `.dockerignore` trigger both available targets. Changes to a workflow trigger
its own target. Unrelated source changes do not deploy. This uses GitHub's
[push branch and path filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

Complete the first-deploy prerequisites above and commit `pnpm-lock.yaml` before
pushing. CI installs with `--frozen-lockfile`. In the generated repository's
**Settings → Secrets and variables → Actions**, create:

| Repository secret | Value |
| --- | --- |
| `FLY_API_TOKEN_LANDING` | Deploy token scoped to the landing Fly app. |
| `LANDING_ENV_PRODUCTION` | Complete filled-in `apps/landing/.env.production` contents. |
| `FLY_API_TOKEN_APP` | Deploy token scoped to the product Fly app; omit for landing-only. |
| `APP_ENV_PRODUCTION` | Complete filled-in `apps/shared/.env.production` contents; omit for landing-only. |

Generate each token locally with `fly tokens create deploy --app <fly-app-name>`
and store its full output in the corresponding secret. Names must match the
committed `fly.toml` files. See [Fly's GitHub Actions guide](https://fly.io/docs/launch/continuous-deployment-with-github-actions/).

The workflows write temporary production env files, call the existing
`landing:secrets` / `app:secrets` and deploy scripts from the repository root,
then remove the files even after failure. Runtime secrets and public frontend
configuration use the same path as local deployment. Database migrations and
optional Mastra initialization remain operator steps.

Each target serializes deployments without cancelling an active rollout. Both
workflows support **Run workflow** from `main`; use it after updating GitHub
secrets, which do not themselves trigger a push event. Other branches cannot
deploy through these workflows. Existing managed apps can receive the workflows
through `create-m5kdev update`; configure their secrets before the first run.

## Build caching and runtime images

Dependency stages copy the lockfile, workspace configuration, and required app
manifests before installing. Only the selected app and its local dependencies
are installed. A BuildKit cache mount at `/pnpm/store` reuses package downloads
when an install layer needs rebuilding. This cache belongs to the builder;
switching builders or clearing its storage can still cause a cold build.

Keep pnpm settings such as `overrides` in `pnpm-workspace.yaml`. The image omits
the root `package.json` so pnpm does not install root development tools and the
deploy CLI. Existing apps adopting these Dockerfiles must move their root
`pnpm.overrides` entries into the workspace file and regenerate their pnpm
lockfile if needed. Copy any additional install inputs, such as patches or
registry configuration, before the install step; supply registry credentials
through build secrets.

Server compilation, webapp compilation, and production dependency packaging
are separate stages. Server-only source edits do not rebuild the SPA, whose
server imports are type-only. The runtime image copies production dependencies,
compiled server output, and frontend assets into separate layers. Add explicit
copies for any additional runtime assets your app requires. When introducing
local workspace dependencies, add their manifests to the appropriate dependency
stages and their source to the stages that consume or package them.

The landing image contains Caddy and the compiled `dist` files. Its
`apps/landing/Caddyfile` serves on port 8080, compresses responses, and falls back
to `index.html` for client routes. Node and frontend build dependencies remain
in the build stage; `vite preview` is only for local previewing.

To check cache behavior, compare a no-change build, a server-only edit, a
webapp-only edit, and a public `VITE_*` change on the same builder. Dependency
install layers should stay cached for source/configuration edits, and only the
affected compilation stages should rerun. Check the build log's context transfer
and image push steps separately from Fly machine rollout.

Before starting the product image, provision PostgreSQL and pgvector in `public`,
apply the app's maintainer-generated PostgreSQL migration history through the
direct connection, and run `mastra:init` when AI is enabled. Initialization is
an explicit deployment step, not a runtime auto-migration. Remove legacy SQLite
mounts only after backing up and validating the data transfer; do not delete a
production volume as part of an unverified cutover.

## `create-m5kdev update` and fly.toml

`create-m5kdev update` **ignores** `**/fly.toml` and `**/.env.production`.
Existing apps keep their Fly app name, region, and secrets file. Dockerfiles
and `.env.production.example` still merge.

To adopt Fly on an app that never had these files, copy them once from a fresh
scaffold or from this release’s Starter, then edit `app =` and secrets locally.
Update will not invent a `fly.toml` into a customized tree as a merge.

Existing apps on 0.33: [Docker, Fly.io, and Node 24 in 0.34.0](/guides/v0.34.0-fly-deploy-migration).
Apps still shipping Starter `fly-*.mjs` copies: [Kernel Fly deploy commands in 0.35.0](/guides/v0.35.0-kernel-fly-commands-migration).

## Same-origin URLs

Production `VITE_APP_URL` and `VITE_SERVER_URL` are operator env (often the
same public origin). The Kernel does not rewrite them.
