import type {
  Job,
  JobsOptions,
  Processor,
  Queue,
  QueueEvents,
  RateLimiterOptions,
  RedisOptions,
  Worker,
  WorkerOptions,
} from "bullmq";

export type { Job, JobsOptions, Processor, Queue, QueueEvents, RedisOptions, Worker, WorkerOptions };

export interface WorkflowQueueConfig {
  concurrency?: number;
  limiter?: RateLimiterOptions;
  defaultJobOptions?: Partial<JobsOptions>;
  defaultWorkerOptions?: Partial<WorkerOptions>;
}

export interface WorkflowServiceConfig {
  connection: RedisOptions;
  queues: Record<string, WorkflowQueueConfig>;
  defaultQueue: string;
  defaults?: {
    timeout?: number;
    jobOptions?: Partial<JobsOptions>;
  };
}

export interface WorkflowJobConfig<
  Payload,
  Result = unknown,
  Awaitable extends boolean = false,
> {
  name: string;
  queue?: string;
  awaitable?: Awaitable;
  retries?: number;
  timeout?: number;
  awaitConcurrency?: number;
  id?: (payload: Payload) => string;
  meta?: (payload: Payload) => { userId?: string; tags?: string[] };
  jobOptions?: Partial<JobsOptions>;
  workerOptions?: Partial<WorkerOptions>;
  /** @internal Phantom field for type inference — never set at runtime. */
  readonly _resultType?: Result;
}

export interface ResolvedJobConfig {
  name: string;
  queueName: string;
  awaitable: boolean;
  timeout: number;
  awaitConcurrency: number;
  idFn?: (payload: unknown) => string;
  metaFn?: (payload: unknown) => { userId?: string; tags?: string[] };
  jobOptions: Partial<JobsOptions>;
  workerOptions: Partial<WorkerOptions>;
}

export interface WorkflowJobDefinitionBase<Payload> {
  readonly jobName: string;
  readonly queueName: string;
  readonly _config: ResolvedJobConfig;
  _handler?: (payload: Payload) => Promise<unknown>;
}

export interface AwaitableJobDefinition<Payload, Result>
  extends WorkflowJobDefinitionBase<Payload> {
  trigger(payload: Payload, overrides?: TriggerOverrides): Promise<Result>;
  triggerMany(payloads: Payload[], overrides?: TriggerOverrides): Promise<Result[]>;
}

export interface FireAndForgetJobDefinition<Payload> extends WorkflowJobDefinitionBase<Payload> {
  trigger(payload: Payload, overrides?: TriggerOverrides): Promise<void>;
  triggerMany(payloads: Payload[], overrides?: TriggerOverrides): Promise<void>;
}

export type WorkflowJobDefinition<Payload, Result = unknown> =
  | AwaitableJobDefinition<Payload, Result>
  | FireAndForgetJobDefinition<Payload>;

export interface TriggerOverrides {
  jobOptions?: Partial<JobsOptions>;
  userId?: string;
  tags?: string[];
}

export interface RegisteredHandler {
  queueName: string;
  handler: (payload: unknown) => Promise<unknown>;
  config: ResolvedJobConfig;
}
