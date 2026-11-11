# Deployment environments

{{APP_NAME}} runs in these Deployment environments. Each one follows a Git
branch, and GitHub Actions deploys it when a pull request merges into that
branch.

| Environment | Branch | Fly app | Database | Schedulers |
| --- | --- | --- | --- | --- |
| Development | `main` | `{{APP_SLUG}}-development` | Neon `development` branch | on |
// m5k:env-staging:start
| Staging | `staging` | `{{APP_SLUG}}-staging` | Neon `staging` branch, derived from Production | on |
// m5k:env-staging:end
// m5k:env-canary:start
| Canary | `canary` | `{{APP_SLUG}}-canary` | Production database (shared with Production) | off |
// m5k:env-canary:end
| Production | `production` | `{{APP_SLUG}}-production` | Neon `production` branch | on |

Feature PRs target `main`. Code moves along the promotion chain one
**Promotion PR** at a time, each from the branch before it:

1. `main`
// m5k:env-staging:start
1. `staging`
// m5k:env-staging:end
// m5k:env-canary:start
1. `canary`
// m5k:env-canary:end
1. `production`

Every deploy runs in this order (`.github/workflows/deploy-app.yml`):

1. **resolve**: maps the branch to its environment. On a release branch it also
   checks that the branch's tree matches a commit on its source branch, so a
   commit pushed straight to `production` never deploys.
2. **migrate**: applies pending migrations to that environment's database.
3. **deploy**: imports runtime secrets and deploys a build of the branch to its
   Fly app.

Migrations run only in step 2. Never add a Fly release command or a migration
step to the Dockerfile.

## One-time setup

These steps need a person with access to Fly, Neon, Upstash, and GitHub. Use
placeholders below; never commit real values.

### 1. Neon (PostgreSQL)

1. Create one Neon project, in a region close to your Fly region.
2. Use the default branch as `production`. Create a `development` branch.
3. On each branch, enable pgvector in `public`:
   `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;`
4. For each branch, note two connection strings:
   - **Pooled** (PgBouncer, transaction mode): `DATABASE_URL`.
   - **Direct** (not pooled): `DATABASE_DIRECT_URL`. Migrations use it.

Development never connects to the Production branch.

### 2. Upstash (Redis)

1. Create one Redis database. Every environment shares it. The BullMQ prefix
   `<APP_SLUG>-<APP_ENV>` keeps their queues apart, so `APP_ENV` and `APP_SLUG`
   must be right in every env file.
2. Turn **eviction off**. BullMQ loses jobs when Redis evicts keys.
3. Idle BullMQ workers and queue listeners keep polling in every environment.
   Upstash bills per command, so compare the fixed-price plans with
   pay-as-you-go.
4. Use the `rediss://` URL as `REDIS_URL` in every env file.

### 3. Fly apps

```sh
fly apps create {{APP_SLUG}}-development
fly apps create {{APP_SLUG}}-production
```

Each app has its own config: `apps/shared/fly.development.toml` and
`apps/shared/fly.production.toml`. Pick the region (`primary_region`) to match
Neon. Health checks call `GET /healthz`. It returns 200 only when the app can
reach its database.

Create one deploy token per app:

```sh
fly tokens create deploy --app {{APP_SLUG}}-development
fly tokens create deploy --app {{APP_SLUG}}-production
```

### 4. Env files

Copy each example and fill it in. Keep the filled-in files out of Git.

```sh
cp apps/shared/.env.development.example apps/shared/.env.development
cp apps/shared/.env.production.example apps/shared/.env.production
```

Each file sets its own `APP_ENV` (`development` or `production`). Each uses that
environment's database URLs, `REDIS_URL`, its public `VITE_APP_URL` and
`VITE_SERVER_URL`, and a separate `BETTER_AUTH_SECRET`. Outside `local`, the
server refuses to boot when any of these is missing.

### 5. GitHub environments and secrets

In **Settings → Environments**, create `development` and `production`. Add
these secrets to **each** environment:

| Secret | Value |
| --- | --- |
| `FLY_API_TOKEN` | The deploy token for that environment's Fly app. |
| `APP_ENV_FILE` | The full contents of that environment's filled-in env file. |
| `DATABASE_DIRECT_URL` | That environment's direct Neon URL. Only the migrate step sees it. |

Under **Deployment branches**, allow only `main` for `development` and only
`production` for `production`. Add required reviewers to `production` if
deploys should wait for approval.

After changing a secret, run the **Deploy app** workflow on that branch to apply
it.

Optional **repository** secrets post a Slack message after a successful
Production deploy (and after landing deploys on `main`). Leave them unset to
skip the ping.

| Secret | Value |
| --- | --- |
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) from a Slack app with `chat:write`. |
| `SLACK_CHANNEL_ID` | Channel ID (`C...`) to post into. Invite the bot to private channels. |

Messages look like `[{{APP_SLUG}}]: Published app v<apps/server/package.json version>`
and `[{{APP_SLUG}}]: Published landing v<apps/landing/package.json version>`.

### 6. Branches and protection

1. Create the `production` branch from `main` and push it.
2. Protect `main` and `production`:
   - require a pull request, and block direct pushes and force pushes;
   - on `production`, require the **Promotion PR** status check.
3. In **Settings → General → Pull Requests**, allow merge commits. Merge
   Promotion PRs with a **merge commit**; never squash or rebase them. Feature
   PRs into `main` may squash.

// m5k:env-staging:start
### Staging

Staging rehearses a release on its own copy of Production data.

1. In Neon, create a `staging` branch **from `production`**, never from
   `development`.
2. Before a rehearsal, reset it from `production` in Neon. A reset overwrites
   Staging's data and schema, so keep nothing on Staging that only lives there.
   If Production holds personal data, mask it before testers or external
   services see it.
3. `fly apps create {{APP_SLUG}}-staging`, then
   `fly tokens create deploy --app {{APP_SLUG}}-staging`.
4. `cp apps/shared/.env.staging.example apps/shared/.env.staging`, using the
   Staging branch's URLs.
5. Create the GitHub environment `staging` with the same three secrets. Allow
   only the `staging` branch to deploy to it.
6. Create and protect the `staging` branch, and require the **Promotion PR**
   check on it.

Schedulers run on Staging, so test recurring jobs here.
// m5k:env-staging:end
// m5k:env-canary:start
### Canary

Canary runs the next release against the **Production database** before
Production gets it.

- Canary's deploy migrates the Production database. Production's own deploy
  then finds nothing pending.
- Its workers run and write real Production data. Its schedulers stay off
  (`APP_ENV=canary`), so recurring jobs run only once, from Production.
- Use test accounts. Anything you do on Canary changes Production data.
- Do not trigger jobs with a deterministic job id (`id` on a Workflow job) on
  Canary yet. Workflow rows are still unique by job id alone, so a deterministic
  id Production has already used cannot also be recorded by Canary: the job
  runs, but its Workflow row write fails and is logged. Random-id jobs are fine.
  A later m5kdev release drops that constraint (michalkow/m5kdev#59).

1. `fly apps create {{APP_SLUG}}-canary`, then
   `fly tokens create deploy --app {{APP_SLUG}}-canary`.
2. `cp apps/shared/.env.canary.example apps/shared/.env.canary`, using
   **Production's** database URLs. Give Canary its own `VITE_APP_URL` and
   `VITE_SERVER_URL`.
3. Create the GitHub environment `canary` with the same three secrets. Its
   `DATABASE_DIRECT_URL` is Production's. Allow only the `canary` branch to
   deploy to it, and consider required reviewers, since it migrates Production.
4. Create and protect the `canary` branch, and require the **Promotion PR**
   check on it.
// m5k:env-canary:end

## Releasing

1. Merge feature PRs into `main`. Development migrates and deploys.
2. Test on Development.
3. Open a Promotion PR into the next branch in the chain. The **Promotion PR**
   check fails for any other source branch.
4. Merge it with a merge commit. That environment migrates and deploys. Test
   it, then promote again until the release reaches `production`.

New commits on `main` while you test do not enter the release. The Promotion PR
carries only what `main` held when you opened or updated it.

Never commit to `production` directly. Fix on `main` and promote again.

## Migrations

Every migration must work with the code that is **currently in Production**,
because the deploy migrates before the new code starts and a rollback
redeploys older code. Read `.cursor/rules/database-migrations.mdc` before
changing a table: expand in one release and contract (drop or rename) in a
later one.

## Rebuilding Development

Several branches can migrate the shared Development database, so it can drift
from `main`. To rebuild it:

1. Set `DATABASE_DISPOSABLE=true` in the env file that points at Development.
   Never set it for Production.
2. Run `pnpm --filter ./apps/server drizzle:rebuild`. It drops the app schema and
   migration history, then re-applies every migration. It keeps the Mastra and
   vector schemas.
3. Run `pnpm --filter ./apps/server drizzle:seed`.

## Rollback

A rollback redeploys earlier code. The schema is never rolled back, which is
why every migration must stay compatible with the previous release.

- **Normal path:** revert the change on `main`, then promote it.
- **Emergency:** redeploy a previous image without migrating:

  ```sh
  fly releases --app {{APP_SLUG}}-production --image
  fly deploy --config apps/shared/fly.production.toml --image <previous image>
  ```

  Then fix forward on `main`.

## Manual deploys

`pnpm app:deploy:<environment>` and `pnpm app:secrets:<environment>` still
work from a clean checkout of that environment's branch. A manual deploy
**does not migrate**. Run the **Deploy app** workflow instead whenever you
can.
