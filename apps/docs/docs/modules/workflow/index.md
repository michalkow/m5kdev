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

Modules and apps register jobs against the workflow service in their
`workflows(...)` hook. A job config declares its `name`, target `queue`,
`retries`, `timeout`, an optional deterministic `id(payload)`, and `meta(payload)`
for attribution (`userId`, `tags`). Jobs can be `awaitable` when the caller needs
the result. Cron schedules are declared with `workflow.cron(config)`, which
upserts a BullMQ job scheduler.

Payload rules (from AGENTS.md): serializable and minimal — ids and typed input,
never request/session objects. Business logic stays in services; job modules are
thin glue.

Example from the notification module (`notification.webPush` / `.mobilePush` /
`.email`):

```ts
this.webPushJob = this.service.workflow
  .job<{ notificationId: string }>({
    name: "notification.webPush",
    id: (p) => `web:${p.notificationId}`,
  })
  .handle(async (payload) => {
    /* deliver; throw on failure */
  });
```

## Experience references in delayed communication

Workflow remains presentation-neutral. A job that sends branded mail carries the
already validated Experience id with its existing resource ids; other jobs do not
need website context. Never enqueue a request, session, descriptor, role, recipient
profile or Entitlement snapshot.

```ts
import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { z } from "zod";

const reportInput = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  reportId: z.string().min(1),
  experienceId: experienceIdSchema.optional(),
}).strict();
type ReportJob = { data: z.infer<typeof reportInput> };

// Inside the module workflows(ctx) hook:
if (!ctx.workflow) throw new Error("Workflow runtime is required");
const { service: workflow, registry } = ctx.workflow;
const deliver = workflow.job<ReportJob>({ name: "app.report-ready" })
  .input(reportInput, true)
  .handle(async ({ data }) => {
    const sent = await reports.deliverReadyReport(data);
    if (sent.isErr()) throw sent.error;
  });
// Register in the module's workflows hook. Service-owned definitions with
// .handle are discovered by the normal Kernel composition.
registry.registerService({ deliver });

// Request producer: requestContext.experience is an approved descriptor.
await deliver.trigger({ data: reportInput.parse({
  userId, organizationId, reportId, experienceId: requestContext.experience?.id,
}) });
```

With this validation option, `.input(schema, true)` validates **payload.data**
when the worker executes. Parse raw input at enqueue too. A flat payload is
supported for existing jobs that do not use this data-validation shape.

The owning `deliverReadyReport` service reloads the current User, Organization,
Membership, report and saved locale, applies live scope/Grants/Entitlements and
expiry checks, then calls `email.resolveCommunicationExperience`. A bound id
wins over policy but is re-resolved against the worker's current deployment.
Scheduled/admin/webhook handlers without an initiating website construct trusted
communication context from those current resource ids; they do not accept a
browser-provided recipient/brand hint. Use the same resolved descriptor for
related links and the existing send method. See [Email policy](/modules/email).

If an Experience was removed/disabled while work waited, the operation fails;
policy does not replace that explicit reference. Keep referenced ids configured
until pending work is drained or explicitly migrated. An older job with no id
still works in the supported shorthand. Switching that deployment to an explicit
registry requires an app-owned resource/event mapping or those older jobs fail;
there is no first-entry or last-browser fallback. A Result error from a handler
fails the actual BullMQ run and is recorded by Workflow.

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
