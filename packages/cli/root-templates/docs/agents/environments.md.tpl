# Deployment environments

How {{APP_NAME}} is deployed, and the rules agents follow because of it. The
human setup lives in `docs/deployment.md`.

| Environment | `APP_ENV` | Branch | Database | Schedulers |
| --- | --- | --- | --- | --- |
| Local | `local` | any | local or Development (`apps/shared/.env`) | on |
| Development | `development` | `main` | Neon `development` | on |
| Production | `production` | `production` | Neon `production` | on |

## Rules

- Open feature PRs into `main` only. Never commit to or open feature PRs into a
  release branch. Code reaches Production only through a Promotion PR from `main`.
- Read the Deployment environment from `APP_ENV`. Never read `NODE_ENV` to decide
  behaviour: it is `production` on every deployed app.
- Use `requireEnvValue` (`@m5kdev/backend/base/environment`) for configuration
  that deployed environments must set. A local default is fine; a deployed
  environment must fail at boot instead of falling back.
- Migrations: generate with `drizzle:generate`, apply only to the local or
  Development database, and keep them backward-compatible with Production. See
  `.cursor/rules/database-migrations.mdc`. The deploy workflow migrates
  deployed environments; there is no other path to the Production database.
- Recurring jobs (Workflow crons) run only where schedulers are on. Do not
  build features that depend on a cron in an environment that has them off.
- Every environment shares one Redis. Workflow queues are kept apart by the
  BullMQ prefix `<APP_SLUG>-<APP_ENV>`, which the Kernel sets. Never prefix queue
  names by hand.
- Workflow rows and Server events are scoped for you; do not add your own
  environment filters on top.
