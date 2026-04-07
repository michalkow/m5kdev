import type {
  Job,
  JobsOptions,
  Processor,
  Queue,
  QueueEvents,
  RateLimiterOptions,
  Worker,
  WorkerOptions,
} from "bullmq";

export type { Job, JobsOptions, Processor, Queue, QueueEvents, Worker, WorkerOptions };

import type IORedis from "ioredis";
export interface WorkflowQueueConfig {
  concurrency?: number;
  limiter?: RateLimiterOptions;
  defaultJobOptions?: Partial<JobsOptions>;
  defaultWorkerOptions?: Partial<WorkerOptions>;
}

export interface WorkflowServiceConfig {
  connection: IORedis;
  queues: Record<string, WorkflowQueueConfig>;
  defaultQueue: string;
  defaults?: {
    timeout?: number;
    jobOptions?: Partial<JobsOptions>;
  };
}

export interface WorkflowJobConfig<Payload, Result = unknown, Awaitable extends boolean = false> {
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
  handle(fn: (payload: Payload) => Promise<Result>): this;
}

export interface FireAndForgetJobDefinition<Payload> extends WorkflowJobDefinitionBase<Payload> {
  trigger(payload: Payload, overrides?: TriggerOverrides): Promise<string>;
  triggerMany(payloads: Payload[], overrides?: TriggerOverrides): Promise<string[]>;
  handle(fn: (payload: Payload) => Promise<void>): this;
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
