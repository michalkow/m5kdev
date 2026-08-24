# Kernel owns Fly deploy and secrets wrappers

Fly deploy/secrets wrappers were copied into every consumer under Deploy home and Landing and went stale when the build-secret contract changed. Those commands now live in the Kernel as `runFlyDeploy` / `runFlySecrets`, exposed as `m5kdev-fly-deploy` / `m5kdev-fly-secrets` bins. Root `app:deploy` / `app:secrets` / `landing:*` scripts only pass path args. Dockerfiles, `fly.toml`, and `.env.production` stay app-owned.

## Considered Options

- **Starter Template copies** (status quo) — rejected: four identical files drift; fixes require every app to copy again.
- **`create-m5kdev` CLI (`m5kdev fly-deploy`)** — rejected: deploy is a Kernel ops concern next to `runDb`, not scaffolding; apps would need a root `create-m5kdev` dependency for day-to-day deploy.
- **`pnpm --filter ./apps/server exec`** — rejected: Landing deploy would go through the server package; a root Kernel bin keeps Landing free of a backend dependency while still sharing one implementation.
