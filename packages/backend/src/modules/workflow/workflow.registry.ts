import type { Job, Worker } from "bullmq";
import { captureServerError, ServerError } from "../../utils/errors";
import { logger as rootLogger } from "../../utils/logger";
import { runWithPosthogRequestState } from "../../utils/posthog";
import {
  actorTelemetryFromJobData,
  runWithActorTelemetry,
  serializeSpanValue,
  withSpan,
} from "../../utils/telemetry";
import type { WorkflowService } from "./workflow.service";
import type {
  RegisteredHandler,
  WorkflowCronDefinition,
  WorkflowJobDefinition,
  WorkflowJobDefinitionBase,
} from "./workflow.types";

const SCHEDULER_LIST_BATCH = 100;

/** Subset of BullMQ `JobSchedulerJson` used for reconciliation (key / name / id / template). */
type JobSchedulerRow = {
  key: string;
  name?: string;
  id?: string | null;
  template?: unknown;
};

function isJobDefinition(value: unknown): value is WorkflowJobDefinitionBase<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "jobName" in value &&
    "queueName" in value &&
    "_config" in value &&
    !("cronName" in value)
  );
}

function isCronDefinition(value: unknown): value is WorkflowCronDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "cronName" in value &&
    "pattern" in value &&
    "_config" in value &&
    "queueName" in value &&
    !("jobName" in value)
  );
}

function getTimeoutMs(entry: RegisteredHandler): number {
  return entry.config.timeout;
}

/** Duck-typed neverthrow Result (avoids depending on a specific neverthrow instance). */
function isNeverthrowResult(
  value: unknown
): value is { isErr(): boolean; isOk(): boolean; error?: unknown; value?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { isErr?: unknown }).isErr === "function" &&
    typeof (value as { isOk?: unknown }).isOk === "function"
  );
}

export class WorkflowRegistry {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly workers = new Map<string, Worker>();
  private readonly logger = rootLogger.child({ layer: "worker", layerName: "WorkflowRegistry" });

  constructor(private readonly workflowService: WorkflowService) {}

  register<Payload, Result>(
    definition: WorkflowJobDefinition<Payload, Result>,
    handler: (payload: Payload) => Promise<Result>
  ): void;

  register(definition: WorkflowCronDefinition, handler: () => Promise<void>): void;

  register(
    definition: WorkflowJobDefinition<unknown, unknown> | WorkflowCronDefinition,
    handler: ((payload: unknown) => Promise<unknown>) | (() => Promise<void>)
  ): void {
    if (this.workers.size > 0) {
      throw new Error("Cannot register handlers after start() has been called");
    }

    if ("cronName" in definition) {
      const cronDef = definition as WorkflowCronDefinition;
      const name = cronDef.cronName;
      if (this.handlers.has(name)) {
        throw new Error(`Handler already registered for job "${name}"`);
      }
      const cronHandler = handler as () => Promise<void>;
      this.handlers.set(name, {
        kind: "cron",
        queueName: cronDef.queueName,
        handler: async () => cronHandler(),
        config: cronDef._config,
      });
      return;
    }

    const jobDef = definition as WorkflowJobDefinition<unknown, unknown>;
    if (this.handlers.has(jobDef.jobName)) {
      throw new Error(`Handler already registered for job "${jobDef.jobName}"`);
    }

    this.handlers.set(jobDef.jobName, {
      kind: "job",
      queueName: jobDef.queueName,
      handler: handler as (payload: unknown) => Promise<unknown>,
      config: jobDef._config,
    });
  }

  registerService(service: Record<string, unknown>): void {
    if (this.workers.size > 0) {
      throw new Error("Cannot register handlers after start() has been called");
    }

    for (const [key, value] of Object.entries(service)) {
      if (isCronDefinition(value)) {
        if (!value._handler) {
          throw new Error(
            `Cron "${value.cronName}" on queue "${value.queueName}" (property "${key}") has no .handle() attached`
          );
        }
        if (this.handlers.has(value.cronName)) {
          throw new Error(`Handler already registered for job "${value.cronName}"`);
        }
        const fn = value._handler;
        this.handlers.set(value.cronName, {
          kind: "cron",
          queueName: value.queueName,
          handler: async () => fn(),
          config: value._config,
        });
        continue;
      }

      if (!isJobDefinition(value)) continue;

      if (!value._handler) {
        throw new Error(
          `Job "${value.jobName}" on queue "${value.queueName}" (property "${key}") has no .handle() attached`
        );
      }
      if (this.handlers.has(value.jobName)) {
        throw new Error(`Handler already registered for job "${value.jobName}"`);
      }

      this.handlers.set(value.jobName, {
        kind: "job",
        queueName: value.queueName,
        handler: value._handler as (payload: unknown) => Promise<unknown>,
        config: value._config,
      });
    }
  }

  async start(): Promise<void> {
    if (this.workers.size > 0) {
      throw new Error("Registry has already been started");
    }

    const queueHandlers = new Map<string, Map<string, RegisteredHandler>>();

    for (const [jobName, entry] of this.handlers) {
      let handlers = queueHandlers.get(entry.queueName);
      if (!handlers) {
        handlers = new Map();
        queueHandlers.set(entry.queueName, handlers);
      }
      handlers.set(jobName, entry);
    }

    for (const [queueName, handlers] of queueHandlers) {
      const workerOptionOverrides = this.mergeWorkerOptions(handlers);

      const worker = this.workflowService._createWorker(
        queueName,
        async (job) => {
          const entry = handlers.get(job.name);
          this.logger.debug(`Processing job: ${job.name}`);
          if (!entry) {
            // scheduler-produced jobs with no handler (version skew, removed
            // crons) would otherwise fire forever — self-heal instead of crashlooping
            if (job.repeatJobKey) {
              await this.removeStaleScheduler(queueName, job.name, job.repeatJobKey);
              return null;
            }
            throw new Error(`No handler registered for job: ${job.name}`);
          }

          return runWithPosthogRequestState({ disableCapture: false }, () =>
            runWithActorTelemetry(actorTelemetryFromJobData(job.data), () =>
              withSpan(
                {
                  name:
                    entry.kind === "cron"
                      ? `workflow.cron.${job.name}`
                      : `workflow.job.${job.name}`,
                  attributes: {
                    "workflow.queue": queueName,
                    "workflow.kind": entry.kind,
                    "workflow.job.name": job.name,
                    ...(job.id !== undefined ? { "workflow.job.id": String(job.id) } : {}),
                    ...(entry.kind === "job" ? { input: serializeSpanValue(job.data) } : {}),
                  },
                },
                async () => {
                  const timeoutMs = getTimeoutMs(entry);
                  let timer: ReturnType<typeof setTimeout> | undefined;

                  const timeoutPromise = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                      reject(
                        new Error(`Job "${job.name}" (${job.id}) timed out after ${timeoutMs}ms`)
                      );
                    }, timeoutMs);
                  });

                  try {
                    const result = await Promise.race([
                      entry.kind === "cron" ? entry.handler(undefined) : entry.handler(job.data),
                      timeoutPromise,
                    ]);
                    // a handler returning err(...) must fail the job, not complete it
                    if (isNeverthrowResult(result)) {
                      if (result.isErr()) throw result.error;
                      return result.value ?? null;
                    }
                    return result ?? null;
                  } finally {
                    if (timer) clearTimeout(timer);
                  }
                }
              )
            )
          );
        },
        workerOptionOverrides
      );

      worker.on("failed", (job, error) => {
        this.captureJobFailure(queueName, job, error);
      });

      worker.on("error", (error) => {
        // infra-level worker error (e.g. Redis connection) — never passes a request boundary
        captureServerError(
          ServerError.fromUnknown("INTERNAL_SERVER_ERROR", error, {
            layer: "workflow",
            layerName: "WorkflowRegistry",
            context: { queue: queueName },
          }),
          { logger: this.logger }
        );
      });

      this.workers.set(queueName, worker);
      this.logger.debug(
        { queue: queueName, jobs: [...handlers.keys()], workflow: "worker-start" },
        `Worker started for queue "${queueName}"`
      );
    }

    const allowedCronKeysByQueue = new Map<string, Set<string>>();
    for (const [name, entry] of this.handlers) {
      if (entry.kind !== "cron") continue;
      let set = allowedCronKeysByQueue.get(entry.queueName);
      if (!set) {
        set = new Set();
        allowedCronKeysByQueue.set(entry.queueName, set);
      }
      set.add(name);
    }

    // Sweep every queue this process works — including queues with no registered
    // crons, which previously never pruned stale schedulers left by other versions.
    for (const queueName of queueHandlers.keys()) {
      const allowed = allowedCronKeysByQueue.get(queueName) ?? new Set<string>();
      for (const [cronName, entry] of this.handlers) {
        if (entry.kind !== "cron" || entry.queueName !== queueName) continue;
        const cfg = entry.config;
        await this.workflowService._upsertCronScheduler(queueName, cronName, cfg.pattern, cfg);
      }

      let start = 0;
      while (true) {
        const batch = (await this.workflowService._getJobSchedulers(
          queueName,
          start,
          start + SCHEDULER_LIST_BATCH - 1
        )) as JobSchedulerRow[];
        for (const scheduler of batch) {
          const sid = scheduler.key;
          const templateName =
            scheduler.template &&
            typeof scheduler.template === "object" &&
            "name" in scheduler.template &&
            typeof (scheduler.template as { name?: string }).name === "string"
              ? (scheduler.template as { name: string }).name
              : undefined;
          const inRegistry =
            (sid && allowed.has(sid)) ||
            (scheduler.name && allowed.has(scheduler.name)) ||
            (typeof scheduler.id === "string" && allowed.has(scheduler.id)) ||
            (templateName && allowed.has(templateName));
          if (sid && !inRegistry) {
            await this.workflowService._removeJobScheduler(queueName, sid);
          }
        }
        if (batch.length < SCHEDULER_LIST_BATCH) break;
        start += SCHEDULER_LIST_BATCH;
      }
    }
  }

  async stop(): Promise<void> {
    await this.workflowService.closeWorkers();
    this.workers.clear();
  }

  /**
   * A job scheduler produced a job this process has no handler for — typically
   * version skew (a newer deployment registered a cron an older worker doesn't
   * know) or a cron that was removed while its scheduler survived in Redis.
   * Remove the scheduler so it stops firing, and report once.
   */
  private async removeStaleScheduler(
    queueName: string,
    jobName: string,
    schedulerId: string
  ): Promise<void> {
    let removed = false;
    try {
      removed = await this.workflowService._removeJobScheduler(queueName, schedulerId);
    } catch {
      removed = false;
    }
    captureServerError(
      new ServerError({
        code: "NOT_IMPLEMENTED",
        layer: "workflow",
        layerName: "WorkflowRegistry",
        message: `No handler for scheduled job "${jobName}" — stale scheduler ${removed ? "removed" : "removal failed"}`,
        context: { queue: queueName, jobName, schedulerId, removed },
      }),
      { logger: this.logger }
    );
  }

  /**
   * Terminal capture for background job failures — jobs never reach a request
   * boundary, so this is their only chance to be reported. Intermediate retry
   * attempts only log a warn; the final attempt is captured (Sentry for 5xx).
   */
  private captureJobFailure(queueName: string, job: Job | undefined, error: Error): void {
    const context = {
      queue: queueName,
      jobName: job?.name,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
    };

    const maxAttempts = job?.opts?.attempts ?? 1;
    const isFinalAttempt = !job || (job.attemptsMade ?? 0) >= maxAttempts;
    if (!isFinalAttempt) {
      this.logger.warn(
        { ...context, err: error },
        `Job attempt failed, will retry: ${error.message}`
      );
      return;
    }

    if (error instanceof ServerError) {
      error.addContext(context);
      if (error.logged) {
        // captured at creation — echo with job context so the failure is traceable
        this.logger.warn(
          {
            ...context,
            code: error.code,
            origin: error.origin,
            sentryEventId: error.sentryEventId,
          },
          `Job failed: ${error.message}`
        );
      } else {
        captureServerError(error, { logger: this.logger });
      }
      return;
    }

    captureServerError(
      ServerError.fromUnknown("INTERNAL_SERVER_ERROR", error, {
        layer: "workflow",
        layerName: "WorkflowRegistry",
        context,
      }),
      { logger: this.logger }
    );
  }

  private mergeWorkerOptions(
    handlers: Map<string, RegisteredHandler>
  ): Partial<import("bullmq").WorkerOptions> {
    const merged: Partial<import("bullmq").WorkerOptions> = {};
    for (const entry of handlers.values()) {
      Object.assign(merged, entry.config.workerOptions);
    }
    return merged;
  }
}
