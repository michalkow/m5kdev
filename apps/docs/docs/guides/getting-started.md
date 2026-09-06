---
sidebar_position: 1
---

# Getting started

Scaffold a product app with the CLI, then read by [module](/modules) or
[package](/packages). Invoke an exact release with `pnpm dlx`. Do not add
`create-m5kdev` as an app dependency. Engines: **Node.js >= 24**.

```sh
pnpm dlx create-m5kdev@0.36.0 my-app
cd my-app
pnpm install
pnpm --filter ./apps/server drizzle:migrate
pnpm --filter ./apps/server drizzle:seed
pnpm dev
```

`--yes` is web + always-on only (Auth, Email, Posts, Email preview, Landing,
Deploy home). Interactive create prompts for Backend Modules (`files`,
`workflows`, `ai`, `notifications`, …). Full flags:
[CLI package](/packages/cli).

Existing apps: [0.34.0](/#upgrade-0-34-0), [0.35.0](/#upgrade-0-35-0), then
[0.36.0](/#upgrade-0-36-0), skipping any that already apply. New 0.36.0 apps
already include those Auth, Email, and Notification changes.

## Local run

The CLI copies `apps/shared/.env.example` to `apps/shared/.env`. Fill
`BETTER_AUTH_SECRET` before exposing the app. Defaults:

| Variable | Default |
| --- | --- |
| `VITE_APP_URL` | `http://localhost:5173` |
| `VITE_SERVER_URL` | `http://localhost:8080` |
| `DATABASE_URL` | `file:./local.db` |
| `REDIS_URL` | `redis://127.0.0.1:6379` (only when Workflow is selected) |

Starter demo login (after seed): `admin@<app-slug>.local` / `password1234`.
Auth emails in store mode write to `apps/server/.emails`.

After changing any `*.db.ts`, register the table in `apps/server/src/schema.ts`,
then `drizzle:generate` and `drizzle:migrate`. Do not hand-edit SQL.

## Common pitfalls

- **Wrong CLI version** — pin `create-m5kdev@0.36.0`, not an older tag from a
  copied command.
- **Redis** — Workflow and Notification delayed Channels need a running Redis
  at `REDIS_URL` before `pnpm dev`. `--yes` does not enable Workflow, so Redis
  is optional until you add it. Notification `dependsOn` Workflow: register both.
- **Database commands vs a live `file:` DB** — stop the server before
  `drizzle:reset` / `drizzle:sync` / `drizzle:seed`, or set `SKIP_DB_GUARD=true`.
  Those scripts call Kernel `runDb` from `apps/server/db.ts` and must not import
  `app.ts`. See [Database commands](/packages/backend#database-commands).
- **File without AWS** — `FileModule` boots without AWS credentials. Local
  uploads still write inventory (`bucket` = `local`) and stamp `memberId`. S3
  client construction is lazy. See [File](/modules/file).
- **Owner and invites** — org self-service cannot grant Owner. Invite creates a
  Membership before accept. See
  [Organizations and members](/guides/organizations-and-members).

Deploy: [Fly.io](/guides/fly-deploy).

## This docs site

The documentation site is a private workspace app at `apps/docs` (Docusaurus,
docs plugin at `/`). From the **framework** monorepo root:

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```

Add feature docs under `docs/modules/<module>/` and package ownership notes
under `docs/packages/`. Prefer linking package pages to module pages instead of
duplicating usage.
