# Canary runs workers without schedulers; Workflow rows and Server events are scoped

All Deployment environments share one Redis (Upstash). Each runs Workflow workers, isolated by its Environment namespace (the BullMQ prefix `<APP_SLUG>-<APP_ENV>`). Canary writes real Production data through its workers; that is intended. Canary does not register job schedulers, because recurring jobs would run twice against the Production database; schedulers are tested on Staging. The Kernel decides this, not the app: `WorkflowModule` registers schedulers only when the environment owns its database (`databaseScope(APP_ENV) === APP_ENV`), and the same `databaseScope` names the Server event scope. Workflow rows record their Deployment environment, so reconcile and lifecycle updates only touch their own environment's rows. Server events are scoped by database rather than environment, so Canary and Production share them while Staging and Development do not.

## Considered Options

- **Workers off in Canary** — rejected: Canary must exercise the jobs a release changes. Prefixes keep its jobs out of Production's workers.
- **Every cron idempotent instead of schedulers off** — rejected: it cannot be enforced, and a non-idempotent cron (billing sync, digests) would run twice.
- **Prefix queue names by hand or use ioredis `keyPrefix`** — rejected: BullMQ's `prefix` option is the supported mechanism and keeps semantic queue names unchanged.
- **Environment-scoped Server events** — rejected: a Canary job changes Production data, so Production browsers should refetch. Scoping by database also stops a Staging copy of Production (same UserIds) from reaching Production users.
- **Separate Redis per environment** — rejected for now: one Upstash instance is cheaper; the required prefix is the only isolation, so the Kernel refuses to boot without `APP_ENV` and `APP_SLUG`.

## Consequences

- Without schedulers, Canary also skips the reconcile cron; Canary Workflow rows can stay stale until the next Canary deploy restores lifecycle events.
- The Workflow table gains an `environment` column and a unique key on `(environment, queue_name, job_id)`; consumers generate that migration and backfill existing rows.
- Jobs that run in Canary must be safe against real Production data.
- Until #59 drops the legacy global unique on `job_id`, a deterministic job id (`idFn`) already used by Production cannot also be recorded by Canary: the job runs but its Workflow row write fails. Avoid triggering deterministic-id jobs on Canary until then.
