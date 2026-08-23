---
sidebar_position: 7
---

# Workflow module

The workflow module runs background jobs and cron schedules on BullMQ/Redis,
with job runs persisted to the `workflows` table for status tracking and
inspection.

Statuses: `queued`, `running`, `completed`, `failed`.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `WORKFLOW_STATUSES` and workflow schemas. |
| `@m5kdev/backend` | `WorkflowModule`: `workflows` table, repository, registry, `WorkflowService`, tRPC procedures. |

## Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";

createBackendApp(
  {
    // ...
    redis: { url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" },
  },
  [
    new WorkflowModule({
      queues: {
        default: { /* WorkflowQueueConfig */ },
        fast: { concurrency: 5 },
      },
      defaultQueue: "default",
      defaults: { timeout: 60_000 },
    }),
  ]
);
```

Redis comes from the Kernel (`createBackendApp({ redis })`). If Redis is
missing, `WorkflowModule` throws
`Workflow module "workflow" requires Redis in createBackendApp(...)`.
The module depends on `auth`.

`create-m5kdev` `workflows` registers `WorkflowModule`, a demo `demo.ping` job
on queue `fast`, and the webapp `/workflows` run-status UI. `--yes` does not
enable it. Start Redis before `pnpm dev` on the server.

## Bull Board

When auth is available, `WorkflowModule` mounts [Bull Board](https://github.com/felixmosh/bull-board)
at `/admin/queues` by default, guarded by `roleAuthMiddleware("admin")`
(admin-role session cookie). Pass `boardPath` to change the mount path, or
`boardPath: null` to skip mounting:

```ts
new WorkflowModule({
  queues: { default: {} },
  defaultQueue: "default",
  boardPath: null, // disable Bull Board
});
```

## Defining jobs

**Primary path:** declare the job as a **service field** with
`this.service.workflow.job({ ... }).handle(fn)`. After services are
constructed, the Kernel calls `registry.registerService(service)` on every
service object and picks up fields that look like job/cron definitions.

A job without `.handle()` throws at registration, for example
`Job "demo.ping" on queue "fast" (property "demoPingJob") has no .handle() attached`.

```ts
readonly demoPingJob = this.service.workflow
  .job<{ userId: string }>({
    name: "demo.ping",
    queue: "fast",
    meta: (payload) => ({ userId: payload.userId }),
  })
  .handle(async () => {
    // Work goes here. Payload must be serializable ids / typed input.
  });

// later
await this.demoPingJob.trigger({ userId: ctx.actor.userId });
```

Job config: `name`, target `queue` (must exist on the module), `retries`,
`timeout`, optional deterministic `id(payload)`, `meta(payload)` for
attribution (`userId`, `tags`), optional `awaitable` when the caller needs the
result. Cron:

```ts
this.service.workflow
  .cron({ name: "nightly.cleanup", pattern: "0 3 * * *", queue: "default" })
  .handle(async () => {
    /* ... */
  });
```

`WorkflowService` also registers `workflow.reconcile` (default every 5 minutes)
to heal persisted rows whose queue events were missed.

The Kernel still invokes each module’s `workflows({ services })` hook after
service scanning. First-party code (Starter demo, Notification
`deliverNotificationJob`) uses service fields, not that hook.

Payload rules: serializable and minimal — ids and typed input, never
request/session objects. Business logic stays in services; job handlers are
thin glue.

## Service API

- `read(id)` / `list(query)` — read persisted workflow runs (backing tRPC).
  List/read are keyed by **UserId** (personal), not MemberId.
- `getQueues()`, `getBullMqQueues()`, `getJobCounts(queueName)`,
  `getJob(queueName, jobId)`, `getJobs(...)` — queue introspection.
- `closeWorkers()` / `close()` — graceful shutdown, called by the Kernel.

## tRPC procedures

| Procedure | Description |
| --- | --- |
| `workflow.read` | Read a workflow run by id (current user's runs) |
| `workflow.list` | List the current user's workflow runs |

Starter `/workflows` polls `workflow.list` while status is `queued` or
`running`, and triggers `demoWorkflow.run`.

## Constraints

- Redis must be reachable before the server starts (`REDIS_URL`).
- Queue names in `.job({ queue })` must be declared on `WorkflowModule`.
- Attach `.handle()` before Kernel `registerService` (constructor of the
  owning service is the usual place).
- Do not import `app.ts` from Database commands; workers are not needed for
  `runDb`.
