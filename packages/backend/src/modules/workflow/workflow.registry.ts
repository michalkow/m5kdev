import type { Worker } from "bullmq";
import { logger as rootLogger } from "../../utils/logger";
import { runWithPosthogRequestState } from "../../utils/posthog";
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
          if (!entry) {
            throw new Error(`No handler registered for job: ${job.name}`);
          }

          return runWithPosthogRequestState({ disableCapture: false }, async () => {
            const timeoutMs = getTimeoutMs(entry);
            let timer: ReturnType<typeof setTimeout> | undefined;

            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error(`Job "${job.name}" (${job.id}) timed out after ${timeoutMs}ms`));
              }, timeoutMs);
            });

            try {
              const result = await Promise.race([
                entry.kind === "cron" ? entry.handler(undefined) : entry.handler(job.data),
                timeoutPromise,
              ]);
              return result ?? null;
            } finally {
              if (timer) clearTimeout(timer);
            }
          });
        },
        workerOptionOverrides
      );

      worker.on("error", (error) => {
        this.logger.error({ queue: queueName, error: error.message }, "Worker error");
      });

      this.workers.set(queueName, worker);
      this.logger.info(
        { queue: queueName, jobs: [...handlers.keys()] },
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

    for (const [queueName, allowed] of allowedCronKeysByQueue) {
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
