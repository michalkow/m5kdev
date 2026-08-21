---
sidebar_position: 8
---

# Deploy with Docker and Fly.io

The **Dockerfile** is the portable artifact: any host that can build from the
repo root can run it. **Fly.io** is the adapter this starter ships (`fly.toml`,
`app:deploy` / `landing:deploy`). Other hosts are not documented as shipped.

Generated apps need **Node.js >= 24**. Images use `node:24-slim` and pnpm from
`packageManager` (`pnpm@10.13.1`).

## What ships

| App | Image | Fly name | Volume |
| --- | --- | --- | --- |
| Product (server + baked webapp) | `apps/shared/Dockerfile` | `<app-slug>-app` in new apps | `libsql_data` → `/app/data` |
| Landing (public site) | `apps/landing/Dockerfile` | `<app-slug>-landing` | none |

There is **one** root `.dockerignore`. Do not add a dockerignore next to a
Dockerfile — Docker only reads the ignore file at the build context root.

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
- **Runtime secrets** — `pnpm app:secrets` / `pnpm landing:secrets` import the
  same file (`fly secrets import`). Use this for `REDIS_URL`, `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, and anything the Node process reads after boot.

Copy the examples first. A missing `.env.production` errors with a
copy-the-example message.

```sh
cp apps/shared/.env.production.example apps/shared/.env.production
cp apps/landing/.env.production.example apps/landing/.env.production
```

Product example includes `DATABASE_URL=file:/app/data/local.db` (the Fly volume)
and documents `REDIS_URL`.

## First deploy

```sh
fly apps create <app-slug>-app
fly apps create <app-slug>-landing
fly volumes create libsql_data --app <app-slug>-app --region iad --size 1
pnpm app:secrets
pnpm landing:secrets
pnpm app:deploy
pnpm landing:deploy
```

Default Fly region in the starter is `iad`, 1gb shared CPU, `PORT=8080`,
`force_https`, `min_machines_running = 1`.

## `create-m5kdev update` and fly.toml

`create-m5kdev update` **ignores** `**/fly.toml` and `**/.env.production`.
Existing apps keep their Fly app name, region, and secrets file. Dockerfiles
and `.env.production.example` still merge.

To adopt Fly on an app that never had these files, copy them once from a fresh
scaffold or from this release’s Starter, then edit `app =` and secrets locally.
Update will not invent a `fly.toml` into a customized tree as a merge.

Existing apps on 0.33: [Docker, Fly.io, and Node 24 in 0.34.0](/guides/v0.34.0-fly-deploy-migration).

## Same-origin URLs

Production `VITE_APP_URL` and `VITE_SERVER_URL` are operator env (often the
same public origin). The Kernel does not rewrite them.
