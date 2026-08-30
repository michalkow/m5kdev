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
import { createBackendApp } from "@m5kdev/backend/app";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";

createBackendApp(config, [
  new WorkflowModule({
    queues: {
      default: { /* WorkflowQueueConfig */ },
      heavy: { /* ... */ },
    },
    defaultQueue: "default",
    defaults: { timeout: 60_000 },
  }),
]);
```

The Redis connection comes from the kernel (`createBackendApp({ redis })`);
the module depends on `auth`.

## Bull Board

When auth is available, `WorkflowModule` mounts [Bull Board](https://github.com/felixmosh/bull-board)
at `/admin/queues` by default, guarded by `roleAuthMiddleware("admin")` (admin-role
session cookie). Pass `boardPath` to change the mount path, or `boardPath: null`
to skip mounting:

```ts
new WorkflowModule({
  queues: { default: {} },
  defaultQueue: "default",
  boardPath: null, // disable Bull Board
})
```

## Defining jobs

Define jobs as **service fields**. A job config declares its `name`, target
`queue`, `retries`, `timeout`, an optional deterministic `id(payload)`, and
`meta(payload)` for attribution (`userId`, `tags`). Jobs can be `awaitable`
when the caller needs the result. Cron schedules are declared with
`workflow.cron(config)`, which upserts a BullMQ job scheduler.

After services are constructed, the Kernel calls
`registry.registerService(service)` on every module service. That scan picks up
fields with `.job().handle()` or `.cron().handle()`. A job or cron **without**
`.handle()` throws at registration (property name is in the error).

The Kernel still calls each module's `workflows(...)` hook after that scan.
First-party code uses service fields; use the hook only for extra registration
that cannot live on a service.

Payload rules (from AGENTS.md): serializable and minimal — ids and typed input,
never request/session objects. Business logic stays in services; job handlers
are thin glue.

Example from `NotificationService`:

```ts
readonly webPushJob = this.service.workflow
  .job<NotificationServiceJobPayload>({
    name: "notification.webPush",
    timeout: 60_000,
    id: (p) => `web:${p.notificationId}`,
  })
  .handle(async (payload) => {
    const result = await this.deliverWebPush(payload.notificationId);
    if (result.isErr()) throw new Error(result.error.message);
  });
```

## Notifying the UI

A fire-and-forget job does not return its result on the triggering mutation
(that call returns `jobId`). When the job finishes work the User did not wait
on, emit a Server event through Auth so the UI can refetch:

- `userEmit` — that User (personal work, or the User who queued the job)
- `organizationEmit` — other Members must see an org-scoped entity the job created

Mount `ServerEventProvider` and invalidate the matching `queryFilter()`.
Reconnect has no replay: invalidate the same queries in `onReconnect`. Keep
polling only as a fallback for in-progress status if you emit only on
completion. Full contract: [Server events](/modules/server-events). Upgrade:
[Kernel Server events in 0.35.0](/guides/v0.35.0-kernel-server-events-migration).

The Starter `DemoWorkflowService` `demo.ping` job is the reference: it
`userEmit`s when the ping finishes; the webapp invalidates `workflow.list`.

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
