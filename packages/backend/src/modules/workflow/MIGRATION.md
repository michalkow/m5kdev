# Migrating to the New WorkflowService

This guide covers migrating from the old `createWorkflowTrigger` / `createWorkflowWorker` function-based API to the new `WorkflowService` + `WorkflowRegistry` class-based API.

No database migration is required. The `workflows` table schema is unchanged.

---

## Conceptual Changes

| Old | New |
|-----|-----|
| `createWorkflowTrigger(service, queues, defaultQueue)` | `WorkflowService` constructor creates queues internally |
| `createWorkflowWorker(service, queueName, opts, jobs)` | `WorkflowRegistry.register()` + `await registry.start()` |
| `WorkflowJob` type with `run`/`onSuccess`/`onFailure` | Plain async handler function `(payload) => Promise<Result>` |
| Worker-level `completed`/`failed` events for DB logging | `QueueEvents`-based lifecycle logging (survives crashes) |
| Consumers construct `Queue` and pass it in | `WorkflowService` owns all `Queue`/`QueueEvents` instances |
| `WorkflowMeta` wrapper around payload | Raw payload as `job.data`; meta extracted separately for DB |
| `WORFLOW_STATUSES` (typo) | `WORKFLOW_STATUSES` (deprecated alias kept for back-compat) |

## Step 1: Composition Root -- Repository + WorkflowService

### Before

```typescript
// repository.ts
import { WorkflowRepository } from "@m5kdev/backend/modules/workflow/workflow.repository";
export const workflowRepository = new WorkflowRepository({ orm, schema });

// service.ts
import { WorkflowService } from "@m5kdev/backend/modules/workflow/workflow.service";
export const workflowService = new WorkflowService({ workflow: workflowRepository }, {});

// queues.ts
import { Queue } from "bullmq";
const connection = { host: "localhost", port: 6379 };
export const queues = {
  fast: new Queue("fast", { connection }),
  slow: new Queue("slow", { connection }),
};
```

### After

```typescript
// repository.ts  (unchanged)
import { WorkflowRepository } from "@m5kdev/backend/modules/workflow/workflow.repository";
export const workflowRepository = new WorkflowRepository({ orm, schema });

// service.ts
import { WorkflowService } from "@m5kdev/backend/modules/workflow/workflow.service";
export const workflowService = new WorkflowService(workflowRepository, {
  connection: { host: "localhost", port: 6379 },
  queues: {
    fast: { concurrency: 10 },
    slow: { concurrency: 2 },
  },
  defaultQueue: "fast",
  defaults: {
    timeout: 60_000,
    jobOptions: { removeOnComplete: { age: 3600 } },
  },
});
```

Key difference: `WorkflowService` receives the repository directly (not via `{ workflow: repo }`) and takes a config object instead of requiring external `Queue` instances. It extends `Base`, not `BaseService`.

## Step 2: Inject WorkflowService into Domain Services

### Before

```typescript
import { createWorkflowTrigger } from "@m5kdev/backend/modules/workflow/workflow.utils";

// In bootstrap code
const { trigger, triggerMany } = createWorkflowTrigger(workflowService, queues, "fast");

// Then pass trigger/triggerMany to your domain service somehow
```

### After

```typescript
// service.ts
export const contentService = new ContentService(
  { content: contentRepository },
  { workflow: workflowService },
);
```

Domain services declare `WorkflowService` as a service dependency. Since `WorkflowService extends Base`, it satisfies `BaseService<Repos, { workflow: WorkflowService }>`.

## Step 3: Define Jobs in Domain Services

### Before

```typescript
// jobs.ts -- separate file defining the job map
import type { WorkflowJob, WorkflowDataType } from "@m5kdev/backend/modules/workflow/workflow.types";

type GeneratePayload = { userId: string; contentId: string };
type GenerateData = WorkflowDataType<GeneratePayload>;

export const jobs = {
  generate: {
    run: async (job) => {
      const { payload } = job.data;
      return ok(await doGeneration(payload));
    },
    onSuccess: async (job) => { /* ... */ },
    onFailure: async (job, error) => { /* ... */ },
    onComplete: async (job) => { /* ... */ },
  } satisfies WorkflowJob<GenerateData, any, "generate">,
};
```

### After

```typescript
// content.service.ts -- job defined as a property on the service
interface GeneratePayload {
  userId: string;
  contentId: string;
}

export class ContentService extends BaseService<
  { content: ContentRepository },
  { workflow: WorkflowService }
> {
  readonly generateContent = this.service.workflow.job<GeneratePayload>({
    name: "generateContent",
    queue: "fast",
    retries: 3,
    meta: (payload) => ({ userId: payload.userId }),
  });

  // The handler method -- called by the registry, not by .job()
  async doGeneration(payload: GeneratePayload): Promise<void> {
    // ... business logic ...
  }
}
```

The job definition (`.job()`) returns a typed trigger object. The handler is a separate method, wired in the registry.

### Awaitable Jobs

```typescript
interface AnalysisResult {
  score: number;
  summary: string;
}

readonly analyzeContent = this.service.workflow.job<GeneratePayload, AnalysisResult>({
  name: "analyzeContent",
  queue: "fast",
  awaitable: true,
  timeout: 30_000,
});
```

When `awaitable: true`, `trigger()` returns `Promise<AnalysisResult>` instead of `Promise<string>` (the BullMQ job id for fire-and-forget).

## Step 4: Trigger Jobs

### Before

```typescript
const result = await trigger({
  name: "generate",
  payload: { userId: "u1", contentId: "c1" },
  meta: { queue: "fast", userId: "u1", tags: ["generation"] },
  options: { priority: 1 },
});
// result is ServerResult<WorkflowReadOutputSchema>
```

### After

```typescript
const jobId = await this.generateContent.trigger(
  { userId: "u1", contentId: "c1" },
  { tags: ["generation"], jobOptions: { priority: 1 } },
);
// returns Promise<string> (job id) for fire-and-forget
```

Changes:
- The payload is the first argument, not wrapped in `{ name, payload, meta }`.
- The job name and queue are already set in the definition.
- `userId` and `tags` are either extracted automatically via the `meta` function or passed in `TriggerOverrides`.
- The return is the BullMQ job id as `string` (fire-and-forget `trigger`), `string[]` (`triggerMany`), or `Result` / `Result[]` when `awaitable: true` — not `ServerResult<WorkflowReadOutputSchema>`.

### Bulk Trigger

```typescript
// Before
await triggerMany({
  name: "generate",
  payload: [payload1, payload2, payload3],
  meta: { queue: "fast", userId: "u1" },
});

// After
const jobIds = await this.generateContent.triggerMany(
  [payload1, payload2, payload3],
  { userId: "u1" },
);
// jobIds[i] corresponds to payload[i] (fire-and-forget)
```

Uses `queue.addBulk` and `repository.addedMany` for batch operations.

## Step 5: Worker Registry

### Before

```typescript
import { createWorkflowWorkers } from "@m5kdev/backend/modules/workflow/workflow.utils";

const workers = createWorkflowWorkers(
  workflowService,
  {
    fast: { connection, concurrency: 10 },
    slow: { connection, concurrency: 2 },
  },
  jobs,
  (error) => sentry.captureException(error),
);
```

### After

```typescript
// worker-registry.ts (app-level composition root)
import { WorkflowRegistry } from "@m5kdev/backend/modules/workflow/workflow.registry";

const registry = new WorkflowRegistry(workflowService);

registry.register(contentService.generateContent, (payload) =>
  contentService.doGeneration(payload),
);

registry.register(contentService.analyzeContent, (payload) =>
  contentService.doAnalysis(payload),
);

await registry.start();
```

`WorkflowRegistry.start()` is **async**: it creates workers, then registers BullMQ job schedulers for each `.cron()` definition and **reconciles** stray schedulers on those queues (removes scheduler keys not present in the registry). Call sites must `await` it and handle rejection.

Changes:
- One `register()` call per job, not a monolithic job map.
- The handler is a plain async function that receives the raw payload.
- No `run`/`onSuccess`/`onFailure`/`onComplete` callbacks -- handle success/failure in the handler itself or let it throw.
- One BullMQ `Worker` is created per queue (not per job). Multiple jobs on the same queue share a worker.
- Unknown job names that arrive in the queue fail immediately with a clear error.

## Step 5b: Handler Chaining + Auto-Discovery (Recommended)

The individual `register()` approach works but creates boilerplate. Two features eliminate it:

### `.handle()` chaining

Chain `.handle()` directly onto `.job()` to co-locate the handler with the definition. The handler is stored on `_handler` and `.handle()` returns `this`, so the property type stays the same -- it can still be triggered from other service methods.

**Before (separate handler method + registry call):**

```typescript
// In service
readonly generateJob = this.service.workflow.job<GeneratePayload>({
  name: "generate",
  meta: (p) => ({ userId: p.userId }),
});

async handleGenerate(payload: GeneratePayload): Promise<void> {
  const result = await this.doGeneration(payload);
  if (result.isErr()) throw result.error;
}

// In registry
registry.register(contentService.generateJob, (p) => contentService.handleGenerate(p));
```

**After (inline handler, no separate method):**

```typescript
// In service -- one chain
readonly generateJob = this.service.workflow.job<GeneratePayload>({
  name: "generate",
  meta: (p) => ({ userId: p.userId }),
}).handle(async (payload) => {
  const result = await this.doGeneration(payload);
  if (result.isErr()) throw result.error;
});

// In registry -- no individual register() call needed (see registerService below)
```

### `registerService()` auto-discovery

Instead of individually registering each job, pass the whole service instance. The registry scans its properties and finds all job definitions that have `.handle()` attached.

**Before:**

```typescript
registry.register(contentService.generateJob, (p) => contentService.handleGenerate(p));
registry.register(contentService.analyzeJob, (p) => contentService.handleAnalyze(p));
registry.register(contentService.embedJob, (p) => contentService.handleEmbed(p));
```

**After:**

```typescript
registry.registerService(contentService);
```

`registerService()`:
- Iterates all own enumerable properties via `Object.entries(service)`.
- Picks up job definitions (`jobName`, `_config`) and cron definitions (`cronName`, `pattern`, `_config`).
- Validates that `_handler` is set. If a job or cron is missing `.handle()`, it throws immediately at boot time with the property name in the error message.
- Validates name uniqueness, same as `register()`.
- Ignores non-job properties (strings, numbers, plain objects, methods, etc.).

### Mixed usage

`register()` and `registerService()` coexist. Use `register()` for edge cases where the handler needs dependencies from a different service than the one defining the job. Use `registerService()` for the common case.

```typescript
const registry = new WorkflowRegistry(workflowService);

// Auto-discover all jobs with .handle() on these services
registry.registerService(contentService);
registry.registerService(storyService);

// Edge case: handler needs a cross-service dependency
registry.register(adminService.reindexJob, (p) =>
  searchService.reindex(p),
);

await registry.start();
```

## Step 5c: Scheduled jobs (`.cron()`)

Use `WorkflowService.cron()` for passive schedules. The **BullMQ job name** for scheduled runs is the cron **`name`** — the same string must be used for worker dispatch, so cron names share the global registry namespace with normal jobs (registering a job and a cron with the same name throws).

```typescript
readonly nightlyDigest = this.service.workflow
  .cron({
    name: "nightlyDigest",
    queue: "slow",
    pattern: "0 7 * * *", // cron expression
    retries: 2,
    timeout: 120_000,
    jobOptions: { priority: 1 },
    workerOptions: { lockDuration: 60_000 },
  })
  .handle(async () => {
    await this.sendDigest();
  });
```

- Chain `.handle(() => Promise<void>)` like `.job().handle(...)`; there is no payload (scheduled job data is `{}`).
- `registerService()` picks up cron definitions the same way as jobs and errors if `.handle()` is missing.
- On `await registry.start()`, schedulers are **upserted** per queue; any **extra** BullMQ job schedulers on that queue whose key/name/id/template name is not in the registered cron set are **removed** (pagination uses index ranges of 100).

Types for consumers: `WorkflowCronConfig`, `ResolvedCronConfig`, and `WorkflowCronDefinition` are exported from `@m5kdev/backend/modules/workflow/workflow.types`.

### DB lifecycle (cron-spawned jobs)

Scheduled jobs do not go through `repository.added()` at enqueue time. The first **`active`** queue event **upserts** a workflow row via `WorkflowRepository.started` (`jobId`, `jobName`, `queueName`) so `completed` / `failed` updates still apply.

## Step 6: tRPC

### Before

```typescript
// workflowService.read(input, ctx) -- procedure builder handled auth internally
return handleTRPCResult(await workflowService.read(input, ctx));
```

### After

```typescript
// workflowService.read({ ...input, userId }) -- userId extracted in tRPC layer
return handleTRPCResult(
  await workflowService.read({ ...input, userId: ctx.actor.userId }),
);
```

The `privateProcedure` middleware already enforces auth. The service method takes `userId` directly.

## Step 7: Graceful Shutdown

### Before

```typescript
// Manual cleanup of workers
for (const worker of Object.values(workers)) {
  await worker.close();
}
for (const queue of Object.values(queues)) {
  await queue.close();
}
```

### After

```typescript
process.on("SIGTERM", async () => {
  server.close();                    // 1. Stop accepting HTTP requests
  await registry.stop();             // 2. Drain in-flight jobs
  await workflowService.close();     // 3. Close queues, events, Redis
});
```

Order matters: stop workers before closing queues and connections.

## Step 8: Mode-Based Bootstrap

Only import and start the registry in modes that run workers:

```typescript
import { workflowService, contentService } from "./service";

const mode = process.env.MODE ?? "all";

// Always: start Express
if (mode === "api" || mode === "all") {
  const server = app.listen(8080);
}

// Worker modes only
if (mode === "worker" || mode === "all") {
  const { WorkflowRegistry } = await import(
    "@m5kdev/backend/modules/workflow/workflow.registry"
  );
  const registry = new WorkflowRegistry(workflowService);
  registry.register(contentService.generateContent, (payload) =>
    contentService.doGeneration(payload),
  );
  await registry.start();
}
```

## Removed Concepts

| Concept | Replacement |
|---------|-------------|
| `WorkflowMeta.disablePosthogCapture` | Handle in your handler or registry-level wrapping |
| `WorkflowJob.onSuccess` / `onFailure` / `onComplete` | Handle in the handler function. Throw to fail, return to succeed. |
| `WorkflowDataType<Payload>` wrapper | Raw `Payload` is `job.data`. No wrapper. |
| `createWorkflowTrigger` | `workflowService.job().trigger()` |
| `createWorkflowWorker` / `createWorkflowWorkers` | `WorkflowRegistry.register()` + `await registry.start()` |
| `worker.on("completed"/"failed")` for DB logging | Automatic via `QueueEvents` in `WorkflowService` constructor |

## Import Path Changes

```typescript
// Before
import { createWorkflowTrigger, createWorkflowWorker } from "@m5kdev/backend/modules/workflow/workflow.utils";
import type { WorkflowJob, WorkflowMeta, WorkflowDataType } from "@m5kdev/backend/modules/workflow/workflow.types";

// After
import { WorkflowService } from "@m5kdev/backend/modules/workflow/workflow.service";
import { WorkflowRegistry } from "@m5kdev/backend/modules/workflow/workflow.registry";
import type {
  WorkflowServiceConfig,
  WorkflowJobConfig,
  WorkflowJobDefinition,
  WorkflowCronConfig,
  WorkflowCronDefinition,
  ResolvedCronConfig,
  AwaitableJobDefinition,
  FireAndForgetJobDefinition,
  TriggerOverrides,
  JobsOptions,
  WorkerOptions,
  RedisOptions,
} from "@m5kdev/backend/modules/workflow/workflow.types";
```

BullMQ types (`JobsOptions`, `WorkerOptions`, `RedisOptions`) are re-exported from `workflow.types` so consumer apps do not need a direct dependency on `bullmq`.

## Constants

```typescript
// Before
import { WORFLOW_STATUSES } from "@m5kdev/commons/modules/workflow/workflow.constants";

// After
import { WORKFLOW_STATUSES } from "@m5kdev/commons/modules/workflow/workflow.constants";
```

The old `WORFLOW_STATUSES` export still exists as a deprecated alias.
