import type {
  WorkflowListInputSchema,
  WorkflowListOutputSchema,
  WorkflowReadInputSchema,
  WorkflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import type { Job } from "bullmq";
import { Queue, QueueEvents, Worker } from "bullmq";
import type IORedis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { Base } from "../base/base.abstract";
import type { ServerResultAsync } from "../base/base.dto";
import type { WorkflowRepository } from "./workflow.repository";
import type {
  AwaitableJobDefinition,
  FireAndForgetJobDefinition,
  Processor,
  ResolvedCronConfig,
  ResolvedJobConfig,
  TriggerOverrides,
  WorkflowCronConfig,
  WorkflowCronDefinition,
  WorkflowJobConfig,
  WorkflowQueueConfig,
  WorkflowServiceConfig,
} from "./workflow.types";

const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_AWAIT_CONCURRENCY = 10;

export class WorkflowService extends Base {
  private readonly queues = new Map<string, Queue>();
  private readonly queueEvents = new Map<string, QueueEvents>();
  /** Workers created via {@link _createWorker}; closed by {@link closeWorkers} / {@link close}. */
  private readonly workers = new Set<Worker>();
  private readonly connection: IORedis;
  private readonly queueConfigs: Record<string, WorkflowQueueConfig>;
  private readonly cronsByName = new Map<string, WorkflowCronDefinition>();

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly config: WorkflowServiceConfig
  ) {
    super("workflow");
    this.queueConfigs = config.queues;

    this.connection = config.connection;

    for (const queueName of Object.keys(config.queues)) {
      const queue = new Queue(queueName, {
        connection: this.connection.duplicate(),
      });
      this.queues.set(queueName, queue);

      const events = new QueueEvents(queueName, {
        connection: this.connection.duplicate(),
      });
      this.attachLifecycleListeners(events, queueName);
      this.queueEvents.set(queueName, events);
    }
  }

  // -- Cron definition API --

  cron(config: WorkflowCronConfig): WorkflowCronDefinition {
    if (this.cronsByName.has(config.name)) {
      throw new Error(`Cron "${config.name}" is already defined on this WorkflowService`);
    }

    const queueName = config.queue ?? this.config.defaultQueue;
    if (!this.queues.has(queueName)) {
      throw new Error(`Queue "${queueName}" is not configured in WorkflowService`);
    }

    const timeout = config.timeout ?? this.config.defaults?.timeout ?? DEFAULT_TIMEOUT;

    const resolved: ResolvedCronConfig = {
      name: config.name,
      queueName,
      pattern: config.pattern,
      timeout,
      jobOptions: config.jobOptions ?? {},
      workerOptions: config.workerOptions ?? {},
    };

    if (config.retries !== undefined && resolved.jobOptions.attempts === undefined) {
      resolved.jobOptions.attempts = config.retries;
    }

    const definition = {
      cronName: config.name,
      queueName,
      pattern: config.pattern,
      _config: resolved,
      _handler: undefined as (() => Promise<void>) | undefined,
      handle(fn: () => Promise<void>) {
        this._handler = fn;
        return this;
      },
    } as WorkflowCronDefinition;

    this.cronsByName.set(config.name, definition);
    return definition;
  }

  // -- Job definition API --

  job<Payload, Result>(
    config: WorkflowJobConfig<Payload, Result, true>
  ): AwaitableJobDefinition<Payload, Result>;

  job<Payload>(
    config: WorkflowJobConfig<Payload, unknown, false>
  ): FireAndForgetJobDefinition<Payload>;

  job<Payload>(config: WorkflowJobConfig<Payload>): FireAndForgetJobDefinition<Payload>;

  job<Payload, Result>(
    config: WorkflowJobConfig<Payload, Result, boolean>
  ): AwaitableJobDefinition<Payload, Result> | FireAndForgetJobDefinition<Payload> {
    const queueName = config.queue ?? this.config.defaultQueue;
    if (!this.queues.has(queueName)) {
      throw new Error(`Queue "${queueName}" is not configured in WorkflowService`);
    }

    const awaitable = config.awaitable ?? false;
    const timeout = config.timeout ?? this.config.defaults?.timeout ?? DEFAULT_TIMEOUT;
    const awaitConcurrency = config.awaitConcurrency ?? DEFAULT_AWAIT_CONCURRENCY;

    const resolved: ResolvedJobConfig = {
      name: config.name,
      queueName,
      awaitable,
      timeout,
      awaitConcurrency,
      idFn: config.id as ((payload: unknown) => string) | undefined,
      metaFn: config.meta as
        | ((payload: unknown) => { userId?: string; tags?: string[] })
        | undefined,
      jobOptions: config.jobOptions ?? {},
      workerOptions: config.workerOptions ?? {},
    };

    if (config.retries !== undefined && resolved.jobOptions.attempts === undefined) {
      resolved.jobOptions.attempts = config.retries;
    }

    const definition = {
      jobName: config.name,
      queueName,
      _config: resolved,
      _handler: undefined as ((payload: Payload) => Promise<unknown>) | undefined,
      trigger: (payload: Payload, overrides?: TriggerOverrides) =>
        this.triggerJob<Payload, Result>(resolved, payload, overrides),
      triggerMany: (payloads: Payload[], overrides?: TriggerOverrides) =>
        this.triggerManyJobs<Payload, Result>(resolved, payloads, overrides),
      handle(fn: (payload: Payload) => Promise<unknown>) {
        this._handler = fn;
        return this;
      },
    };

    return definition as AwaitableJobDefinition<Payload, Result> &
      FireAndForgetJobDefinition<Payload>;
  }

  // -- Read/list (absorbed from old service) --

  async read(
    input: WorkflowReadInputSchema & { userId: string }
  ): ServerResultAsync<WorkflowReadOutputSchema> {
    return this.workflowRepository.read(input);
  }

  async list(
    input: WorkflowListInputSchema & { userId: string }
  ): ServerResultAsync<WorkflowListOutputSchema> {
    return this.workflowRepository.list(input);
  }

  // -- Queue inspection --

  getQueues(): string[] {
    return [...this.queues.keys()];
  }

  /**
   * Every BullMQ `Queue` owned by this service, sorted by name for stable ordering.
   * Use with Bull Board by wrapping each in `BullMQAdapter` from `@bull-board/api/bullMQ`.
   */
  getBullMqQueues(): Queue[] {
    return [...this.queues.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, queue]) => queue);
  }

  async getJobCounts(queueName: string): Promise<Record<string, number>> {
    const queue = this.getQueue(queueName);
    return queue.getJobCounts();
  }

  async getJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async getJobs(
    queueName: string,
    status: "active" | "waiting" | "delayed" | "completed" | "failed",
    start?: number,
    end?: number
  ) {
    const queue = this.getQueue(queueName);
    return queue.getJobs([status], start, end);
  }

  // -- Worker creation (internal, for registry only) --

  /**
   * @internal Intended for {@link WorkflowRegistry} only. Each worker is added to `this.workers`
   * and must be shut down via {@link closeWorkers} or {@link close}.
   */
  _createWorker(
    queueName: string,
    processor: Processor,
    overrides?: Partial<import("bullmq").WorkerOptions>
  ): Worker {
    const queueConfig = this.queueConfigs[queueName];
    if (!queueConfig) {
      throw new Error(`Queue "${queueName}" is not configured in WorkflowService`);
    }

    const mergedOptions: import("bullmq").WorkerOptions = {
      ...queueConfig.defaultWorkerOptions,
      ...overrides,
      connection: this.connection.duplicate(),
      concurrency: overrides?.concurrency ?? queueConfig.concurrency,
    };

    const worker = new Worker(queueName, processor, mergedOptions);
    this.workers.add(worker);
    return worker;
  }

  /**
   * @internal For {@link WorkflowRegistry} only — activates a BullMQ job scheduler on the queue.
   */
  async _upsertCronScheduler(
    queueName: string,
    cronName: string,
    pattern: string,
    resolved: ResolvedCronConfig,
  ): Promise<Job | undefined> {
    const queue = this.getQueue(queueName);
    const mergedOpts = this.mergeCronTemplateJobOptions(resolved);
    const job = await queue.upsertJobScheduler(cronName, { pattern }, {
      name: cronName,
      data: {},
      opts: mergedOpts,
    });
    return job ?? undefined;
  }

  /**
   * @internal For {@link WorkflowRegistry} — list job schedulers (`start` / `end` are index-based).
   */
  _getJobSchedulers(
    queueName: string,
    start: number,
    end: number,
    asc?: boolean,
  ): ReturnType<Queue["getJobSchedulers"]> {
    const queue = this.getQueue(queueName);
    return queue.getJobSchedulers(start, end, asc);
  }

  /**
   * @internal For {@link WorkflowRegistry} — remove a scheduler by id.
   */
  async _removeJobScheduler(queueName: string, schedulerId: string): Promise<boolean> {
    const queue = this.getQueue(queueName);
    return queue.removeJobScheduler(schedulerId);
  }

  // -- Lifecycle --

  /**
   * @internal Closes all BullMQ workers created through {@link _createWorker}. Prefer
   * {@link close} for full shutdown (workers, queues, events, Redis).
   */
  async closeWorkers(): Promise<void> {
    const snapshot = [...this.workers];
    this.workers.clear();

    await Promise.allSettled(
      snapshot.map(async (worker) => {
        try {
          await worker.close();
        } catch (error) {
          this.logger.error(
            { error: error instanceof Error ? error.message : String(error) },
            "Failed to close BullMQ worker"
          );
        }
      })
    );
  }

  /**
   * Shuts down workers (see {@link closeWorkers}), queue event listeners, queues, and the Redis
   * connection. Safe to call if no workers were created.
   */
  async close(): Promise<void> {
    await this.closeWorkers();

    const closePromises: Promise<void>[] = [];

    for (const events of this.queueEvents.values()) {
      closePromises.push(events.close());
    }
    for (const queue of this.queues.values()) {
      closePromises.push(queue.close());
    }

    await Promise.all(closePromises);
    this.connection.disconnect();
  }

  // -- Private helpers --

  private static readUserIdFromJobData(data: unknown): string | undefined {
    if (data === null || typeof data !== "object") return undefined;
    const v = (data as { userId?: unknown }).userId;
    return typeof v === "string" && v.length > 0 ? v : undefined;
  }

  private getQueue(queueName: string): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" is not configured in WorkflowService`);
    }
    return queue;
  }

  private mergeJobOptions(
    resolved: ResolvedJobConfig,
    overrides?: TriggerOverrides
  ): import("bullmq").JobsOptions {
    const queueDefaults = this.queueConfigs[resolved.queueName]?.defaultJobOptions ?? {};

    return {
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
      ...this.config.defaults?.jobOptions,
      ...queueDefaults,
      ...resolved.jobOptions,
      ...overrides?.jobOptions,
    };
  }

  private mergeCronTemplateJobOptions(resolved: ResolvedCronConfig): import("bullmq").JobsOptions {
    const queueDefaults = this.queueConfigs[resolved.queueName]?.defaultJobOptions ?? {};

    return {
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
      ...this.config.defaults?.jobOptions,
      ...queueDefaults,
      ...resolved.jobOptions,
    };
  }

  private resolveMeta(
    resolved: ResolvedJobConfig,
    payload: unknown,
    overrides?: TriggerOverrides
  ): { userId?: string; tags?: string[] } {
    const metaFromPayload = resolved.metaFn?.(payload) ?? {};
    return {
      userId: overrides?.userId ?? metaFromPayload.userId,
      tags: overrides?.tags ?? metaFromPayload.tags,
    };
  }

  private async triggerJob<Payload, Result>(
    resolved: ResolvedJobConfig,
    payload: Payload,
    overrides?: TriggerOverrides
  ): Promise<Result | string> {
    const queue = this.getQueue(resolved.queueName);
    const jobId = resolved.idFn ? resolved.idFn(payload) : uuidv4();
    const mergedOptions = this.mergeJobOptions(resolved, overrides);
    const meta = this.resolveMeta(resolved, payload, overrides);

    const job = await queue.add(resolved.name, payload, {
      ...mergedOptions,
      jobId,
    });

    if (!job?.id) {
      throw new Error("Failed to add job to queue");
    }

    await this.workflowRepository.added({
      userId: meta.userId,
      jobId: job.id,
      jobName: resolved.name,
      queueName: resolved.queueName,
      timeout: resolved.timeout,
      tags: meta.tags,
      input: payload,
    });

    if (resolved.awaitable) {
      const events = this.queueEvents.get(resolved.queueName);
      if (!events) {
        throw new Error(`QueueEvents not found for queue "${resolved.queueName}"`);
      }

      const result = await Promise.race([
        job.waitUntilFinished(events, resolved.timeout),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Job "${resolved.name}" timed out after ${resolved.timeout}ms`)),
            resolved.timeout
          )
        ),
      ]);

      return result as Result;
    }

    return job.id;
  }

  private async triggerManyJobs<Payload, Result>(
    resolved: ResolvedJobConfig,
    payloads: Payload[],
    overrides?: TriggerOverrides
  ): Promise<Result[] | string[]> {
    const queue = this.getQueue(resolved.queueName);
    const mergedOptions = this.mergeJobOptions(resolved, overrides);

    const bulkData = payloads.map((payload) => {
      const jobId = resolved.idFn ? resolved.idFn(payload) : uuidv4();
      return {
        name: resolved.name,
        data: payload,
        opts: { ...mergedOptions, jobId },
      };
    });

    const jobs = await queue.addBulk(bulkData);

    if (!jobs || jobs.length === 0) {
      throw new Error("Failed to add jobs to queue");
    }

    const metaEntries = payloads.map((payload, i) => {
      const meta = this.resolveMeta(resolved, payload, overrides);
      return {
        userId: meta.userId,
        jobId: jobs[i].id as string,
        jobName: resolved.name,
        queueName: resolved.queueName,
        timeout: resolved.timeout,
        tags: meta.tags,
        input: payload,
      };
    });

    await this.workflowRepository.addedMany(metaEntries);

    if (resolved.awaitable) {
      const events = this.queueEvents.get(resolved.queueName);
      if (!events) {
        throw new Error(`QueueEvents not found for queue "${resolved.queueName}"`);
      }

      const concurrency = resolved.awaitConcurrency;
      const results = new Array<Result>(jobs.length);
      const pending = new Set<Promise<void>>();

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const p = (async () => {
          const result = await Promise.race([
            job.waitUntilFinished(events, resolved.timeout),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(new Error(`Job "${resolved.name}" timed out after ${resolved.timeout}ms`)),
                resolved.timeout
              )
            ),
          ]);
          results[i] = result as Result;
        })();

        pending.add(p);
        p.finally(() => pending.delete(p));

        if (pending.size >= concurrency) {
          await Promise.race(pending);
        }
      }

      await Promise.all(pending);
      return results;
    }

    return jobs.map((j) => j.id as string);
  }

  private attachLifecycleListeners(events: QueueEvents, queueName: string): void {
    events.on("active", ({ jobId }) => {
      void (async () => {
        try {
          const queue = this.getQueue(queueName);
          const job = await queue.getJob(jobId);
          const jobName = job?.name ?? "__unknown__";
          const userId = WorkflowService.readUserIdFromJobData(job?.data);
          await this.workflowRepository.started({ jobId, jobName, queueName, userId });
        } catch (error) {
          this.logger.error({ jobId, queueName, error }, "Failed to log job active event");
        }
      })();
    });

    events.on("completed", ({ jobId, returnvalue }) => {
      let output: unknown;
      try {
        output = JSON.parse(returnvalue);
      } catch {
        output = returnvalue;
      }

      this.workflowRepository.completed({ jobId, output }).catch((error) => {
        this.logger.error({ jobId, error }, "Failed to log job completed event");
      });
    });

    events.on("failed", ({ jobId, failedReason }) => {
      this.workflowRepository
        .failed({
          jobId,
          error: failedReason,
        })
        .catch((error) => {
          this.logger.error({ jobId, error }, "Failed to log job failed event");
        });
    });
  }
}
