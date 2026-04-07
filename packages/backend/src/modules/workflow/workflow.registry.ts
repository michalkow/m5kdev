import type { Worker } from "bullmq";
import { logger as rootLogger } from "../../utils/logger";
import { runWithPosthogRequestState } from "../../utils/posthog";
import type { WorkflowService } from "./workflow.service";
import type { RegisteredHandler, WorkflowJobDefinition } from "./workflow.types";

export class WorkflowRegistry {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly workers = new Map<string, Worker>();
  private readonly logger = rootLogger.child({ layer: "worker", layerName: "WorkflowRegistry" });

  constructor(private readonly workflowService: WorkflowService) {}

  register<Payload, Result>(
    definition: WorkflowJobDefinition<Payload, Result>,
    handler: (payload: Payload) => Promise<Result>,
  ): void {
    if (this.workers.size > 0) {
      throw new Error("Cannot register handlers after start() has been called");
    }

    if (this.handlers.has(definition.jobName)) {
      throw new Error(`Handler already registered for job "${definition.jobName}"`);
    }

    this.handlers.set(definition.jobName, {
      queueName: definition.queueName,
      handler: handler as (payload: unknown) => Promise<unknown>,
      config: definition._config,
    });
  }

  start(): void {
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
            const timeoutMs = entry.config.timeout;
            let timer: ReturnType<typeof setTimeout> | undefined;

            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error(`Job "${job.name}" (${job.id}) timed out after ${timeoutMs}ms`));
              }, timeoutMs);
            });

            try {
              const result = await Promise.race([entry.handler(job.data), timeoutPromise]);
              return result ?? null;
            } finally {
              if (timer) clearTimeout(timer);
            }
          });
        },
        workerOptionOverrides,
      );

      worker.on("error", (error) => {
        this.logger.error({ queue: queueName, error: error.message }, "Worker error");
      });

      this.workers.set(queueName, worker);
      this.logger.info(
        { queue: queueName, jobs: [...handlers.keys()] },
        `Worker started for queue "${queueName}"`,
      );
    }
  }

  async stop(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const worker of this.workers.values()) {
      closePromises.push(worker.close());
    }
    await Promise.all(closePromises);
    this.workers.clear();
  }

  private mergeWorkerOptions(
    handlers: Map<string, RegisteredHandler>,
  ): Partial<import("bullmq").WorkerOptions> {
    const merged: Partial<import("bullmq").WorkerOptions> = {};
    for (const entry of handlers.values()) {
      Object.assign(merged, entry.config.workerOptions);
    }
    return merged;
  }
}
