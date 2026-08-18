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
import type { z } from "zod";
import type { ServerResultAsync } from "../base/base.dto";

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
  /**
   * Periodic sweep that re-syncs stale DB rows from BullMQ — heals transitions
   * missed while QueueEvents was down (deploys, reconnects). Enabled by default.
   */
  reconcile?: {
    enabled?: boolean;
    /** Cron pattern for the sweep. Default: every 5 minutes. */
    pattern?: string;
    /** Queue the sweep job runs on. Default: `defaultQueue`. */
    queue?: string;
    /** Ignore rows updated within this window. Default: 60 seconds. */
    graceSeconds?: number;
    /** Max rows checked per sweep. Default: 100. */
    batch?: number;
  };
}

export interface WorkflowJobConfig<Payload, Awaitable extends boolean = false> {
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
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  validateInput?: boolean;
  validateOutput?: boolean;
}

type WorkflowJobTriggerResult<TExpectedOutput, Awaitable extends boolean> = Awaitable extends true
  ? // biome-ignore lint/suspicious/noConfusingVoidType: void is the sentinel for "no output schema"
    [TExpectedOutput] extends [void]
    ? null
    : TExpectedOutput
  : string;

export interface WorkflowJobDefinitionBase<Payload> {
  readonly jobName: string;
  readonly queueName: string;
  readonly _config: ResolvedJobConfig;
  _handler?: (payload: Payload) => Promise<unknown>;
}

export interface WorkflowJobDefinition<
  Payload,
  TExpectedOutput = void,
  Awaitable extends boolean = false,
> extends WorkflowJobDefinitionBase<Payload> {
  input<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): WorkflowJobDefinition<
    Omit<Payload, "data"> & { data: z.infer<TSchema> },
    TExpectedOutput,
    Awaitable
  >;
  output<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): WorkflowJobDefinition<Payload, z.infer<TSchema>, Awaitable>;
  trigger(
    payload: Payload,
    overrides?: TriggerOverrides
  ): Promise<WorkflowJobTriggerResult<TExpectedOutput, Awaitable>>;
  triggerMany(
    payloads: Payload[],
    overrides?: TriggerOverrides
  ): Promise<WorkflowJobTriggerResult<TExpectedOutput, Awaitable>[]>;
  // biome-ignore lint/suspicious/noConfusingVoidType: void is the sentinel for "no output schema"
  handle: [TExpectedOutput] extends [void]
    ? (fn: (payload: Payload) => Promise<void>) => this
    : (fn: (payload: Payload) => ServerResultAsync<TExpectedOutput>) => this;
}

export type FireAndForgetJobDefinition<Payload> = WorkflowJobDefinition<Payload, void, false>;

export type AwaitableJobDefinition<Payload, Result = null> = WorkflowJobDefinition<
  Payload,
  Result,
  true
>;

/** Definition-time config for scheduled work (BullMQ job schedulers). Handlers take no payload. */
export interface WorkflowCronConfig {
  name: string;
  queue?: string;
  pattern: string;
  retries?: number;
  timeout?: number;
  jobOptions?: Partial<JobsOptions>;
  workerOptions?: Partial<WorkerOptions>;
}

export interface ResolvedCronConfig {
  name: string;
  queueName: string;
  pattern: string;
  timeout: number;
  jobOptions: Partial<JobsOptions>;
  workerOptions: Partial<WorkerOptions>;
}

export interface WorkflowCronDefinition {
  readonly cronName: string;
  readonly queueName: string;
  readonly pattern: string;
  readonly _config: ResolvedCronConfig;
  _handler?: () => Promise<void>;
  handle(fn: () => Promise<void>): this;
}

export interface TriggerOverrides {
  jobOptions?: Partial<JobsOptions>;
  userId?: string;
  tags?: string[];
}

export type RegisteredHandler =
  | {
      kind: "job";
      queueName: string;
      handler: (payload: unknown) => Promise<unknown>;
      config: ResolvedJobConfig;
    }
  | {
      kind: "cron";
      queueName: string;
      handler: (payload: unknown) => Promise<unknown>;
      config: ResolvedCronConfig;
    };
