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
the module throws at service construction if Redis is missing. Depends on
`auth`.

By default a reconcile cron (`workflow.reconcile`, every 5 minutes) re-syncs
stale DB rows from BullMQ after missed queue events (deploys, reconnects).
Disable or retune with `reconcile: { enabled: false }` or `pattern` / `queue` /
`graceSeconds` / `batch`.

## Defining jobs

After `WorkflowService` is constructed, the kernel scans **every module
service** for job and cron definitions (properties with `.handle()` attached).
You do not register handlers in a `workflows()` hook unless you need extra
wiring there.

Keep the definition as a service field so the registry can find it. Payload
must be serializable: ids and typed input, never request/session objects.
Business logic stays in services; the handler is glue.

```ts
readonly processItemJob = this.service.workflow
  .job<{ itemId: string; userId: string }>({
    name: "processItem",
    queue: "default",          // optional; defaults to defaultQueue
    retries: 3,                // maps to BullMQ attempts
    timeout: 60_000,
    awaitable: false,          // true → trigger() waits for the result
    id: (p) => p.itemId,       // deterministic job id (dedupe)
    meta: (p) => ({ userId: p.userId, tags: ["item"] }),
  })
  .handle(async (payload) => {
    await this.processItem(payload.itemId);
  });
```

Enqueue with `this.processItemJob.trigger({ itemId, userId })` (returns a job
id) or `triggerMany([...])`. Awaitable jobs return the handler result instead
of the id.

### Input / output schemas

| Builder | Typing | Runtime check |
| --- | --- | --- |
| `.input(schema, validate?)` | Types `payload.data` as `z.infer<schema>` | Only when `validate === true` |
| `.output(schema, validate?)` | Types the awaitable result / handler return | Only when `validate === true` |

Runtime input validation reads `payload.data` (not the whole payload). Invalid
input or output throws, so BullMQ can retry. If the handler returns a
`ServerResult` error, output validation is skipped and the error is returned.

Pass `true` only when you want a runtime parse. Schema-only (default) is a
type-level contract.

### Cron

```ts
readonly nightly = this.service.workflow
  .cron({ name: "nightlySweep", pattern: "0 3 * * *", queue: "heavy" })
  .handle(async () => {
    await this.sweep();
  });
```

Handlers take no payload. Duplicate cron names on the same `WorkflowService`
throw. On `registry.start()`, schedulers are upserted per queue and extra
BullMQ schedulers on those queues (left by removed crons or version skew) are
removed. Scheduler-produced jobs with no handler are dropped the same way
instead of crash-looping.

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

## Constraints

- Job names must be unique across the process; the second `.handle()` for the
  same name throws at registry scan.
- Every definition must call `.handle()` before the kernel starts workers.
- Completed jobs are removed after 24h, failed after 7 days (overridable via
  queue/job options).
- A persist failure after `queue.add` is logged; the job is already queued.
