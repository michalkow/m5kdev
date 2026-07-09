---
sidebar_position: 7
---

# Workflow module

The workflow module runs background jobs and cron schedules on BullMQ/Redis, with
job runs persisted to the `workflows` table for status tracking and inspection.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `WORKFLOW_STATUSES` (`queued`, `running`, `completed`, `failed`) and workflow schemas. |
| `@m5kdev/backend` | `WorkflowModule`: `workflows` table, repository, registry, `WorkflowService`, tRPC procedures. |

## Registration

```ts
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";

backendApp.use(
  new WorkflowModule({
    queues: {
      default: { /* WorkflowQueueConfig */ },
      heavy: { /* ... */ },
    },
    defaultQueue: "default",
    defaults: { timeout: 60_000 },
  })
);
```

The Redis connection comes from the kernel (`createBackendApp({ redis })`);
the module depends on `auth`.

## Defining jobs

Modules and apps register jobs against the workflow service in their
`workflows(...)` hook. A job config declares its `name`, target `queue`,
`retries`, `timeout`, an optional deterministic `id(payload)`, and `meta(payload)`
for attribution (`userId`, `tags`). Jobs can be `awaitable` when the caller needs
the result. Cron schedules are declared with `workflow.cron(config)`, which
upserts a BullMQ job scheduler.

Payload rules (from AGENTS.md): serializable and minimal — ids and typed input,
never request/session objects. Business logic stays in services; job modules are
thin glue.

Example from the notification module:

```ts
readonly deliverNotificationJob = this.service.workflow.job({ /* config */ });
```

## Service API

- `read(id)` / `list(query)` — read persisted workflow runs (backing the tRPC
  procedures).
- `getQueues()`, `getBullMqQueues()`, `getJobCounts(queueName)`,
  `getJob(queueName, jobId)`, `getJobs(...)` — queue introspection.
- `closeWorkers()` / `close()` — graceful shutdown, called by the kernel.

## tRPC procedures

| Procedure | Description |
| --- | --- |
| `workflow.read` | Read a workflow run by id |
| `workflow.list` | List workflow runs with the shared query contract |
