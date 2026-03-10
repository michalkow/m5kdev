import type { WorkflowReadOutputSchema } from "@m5kdev/commons/modules/workflow/workflow.schema";
import { type JobsOptions, type Queue, Worker, type WorkerOptions } from "bullmq";
import { err } from "neverthrow";
import type { ServerErrorLayer } from "../base/base.types";
import { ServerError } from "../../utils/errors";
import { logger as rootLogger } from "../../utils/logger";
import { runWithPosthogRequestState } from "../../utils/posthog";
import type { ServerResultAsync } from "../base/base.dto";
import type { WorkflowService } from "./workflow.service";
import type { WorkflowDataType, WorkflowJob, WorkflowMeta } from "./workflow.types";

const errorOptions = {
  layer: "workflow" as ServerErrorLayer,
  layerName: "WorkflowTrigger",
};

function shouldDisablePosthogFromPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;

  const session = (
    payload as {
      ctx?: {
        session?: {
          impersonatedBy?: string | null;
        };
      };
    }
  ).ctx?.session;

  return Boolean(session?.impersonatedBy);
}

export function createWorkflowTrigger<
  Jobs extends Record<string, WorkflowJob<WorkflowDataType<any>, any, string>>,
>(service: WorkflowService, queues: Record<string, Queue>, defaultQueue: string) {
  const trigger = async ({
    name,
    payload,
    meta,
    options,
  }: {
    name: string;
    payload: Parameters<Jobs[keyof Jobs & string]["run"]>[0]["data"]["payload"];
    meta?: WorkflowMeta;
    options?: JobsOptions;
  }): ServerResultAsync<WorkflowReadOutputSchema> => {
    const { queue: queueName, userId, tags, timeout = 60 * 60 * 1000 } = meta || {};
    const disablePosthogCapture =
      meta?.disablePosthogCapture ?? shouldDisablePosthogFromPayload(payload);
    const compiledQueueName = queueName || (defaultQueue as string);

    if (!compiledQueueName || !Object.keys(queues).includes(compiledQueueName)) {
      return err(new ServerError({ code: "NOT_FOUND", ...errorOptions }));
    }

    const queue = queues[compiledQueueName as string];

    if (!queue) {
      return err(new ServerError({ code: "NOT_FOUND", ...errorOptions }));
    }
    try {
      const job = await queue.add(
        name,
        {
          payload,
          meta: { ...meta, timeout, disablePosthogCapture },
        },
        {
          removeOnComplete: {
            age: 24 * 3600, // keep up to 24 hours
          },
          removeOnFail: {
            age: 7 * 24 * 3600, // keep up to week
          },
          ...options,
        }
      );

      if (!job || !job.id) {
        return err(new ServerError({ code: "INTERNAL_SERVER_ERROR", ...errorOptions }));
      }

      return await service.added({
        userId,
        jobId: job.id,
        jobName: name,
        input: payload,
        timeout,
        queueName: compiledQueueName,
        tags,
      });
    } catch (error) {
      return err(new ServerError({ code: "INTERNAL_SERVER_ERROR", ...errorOptions }));
    }
  };

  const triggerMany = async ({
    name,
    payload,
    meta,
    options,
  }: {
    name: string;
    payload: Parameters<Jobs[keyof Jobs & string]["run"]>[0]["data"]["payload"][];
    meta?: WorkflowMeta;
    options?: JobsOptions;
  }): ServerResultAsync<WorkflowReadOutputSchema[]> => {
    const { queue: queueName, userId, tags, timeout = 60 * 60 * 1000 } = meta || {};
    const compiledQueueName = queueName || (defaultQueue as string);

    if (!compiledQueueName || !Object.keys(queues).includes(compiledQueueName)) {
      return err(new ServerError({ code: "NOT_FOUND", ...errorOptions }));
    }

    const queue = queues[compiledQueueName as string];

    if (!queue) {
      return err(new ServerError({ code: "NOT_FOUND", ...errorOptions }));
    }
    try {
      const jobs = await queue.addBulk(
        payload.map((p) => {
          const disablePosthogCapture =
            meta?.disablePosthogCapture ?? shouldDisablePosthogFromPayload(p);

          return {
            name,
            data: { payload: p, meta: { ...meta, timeout, disablePosthogCapture } },
            options: {
              removeOnComplete: {
                age: 24 * 3600, // keep up to 24 hours
              },
              removeOnFail: {
                age: 7 * 24 * 3600, // keep up to week
              },
              ...options,
            },
          };
        })
      );

      if (!jobs || jobs.length === 0) {
        return err(new ServerError({ code: "INTERNAL_SERVER_ERROR", ...errorOptions }));
      }

      return await service.addedMany(
        jobs.map((j) => ({
          userId,
          jobId: j.id as string,
          jobName: name,
          input: j.data.payload,
          timeout,
          queueName: compiledQueueName,
          tags,
        }))
      );
    } catch (error) {
      return err(new ServerError({ code: "INTERNAL_SERVER_ERROR", ...errorOptions }));
    }
  };

  return { trigger, triggerMany };
}

export function createWorkflowWorker<
  Jobs extends Record<string, WorkflowJob<WorkflowDataType<any>, any, string>>,
>(
  service: WorkflowService,
  queueName: string,
  workerOptions: WorkerOptions,
  jobs: Jobs,
  errorHandler?: (error: unknown) => void
) {
  const logger = rootLogger.child({ layer: "worker" });

  const worker = new Worker(
    queueName,
    async (job) => {
      const { meta } = job.data as { meta: WorkflowMeta; payload: any };
      return await runWithPosthogRequestState(
        { disableCapture: Boolean(meta?.disablePosthogCapture) },
        async () => {
          const timer =
            meta?.timeout &&
            setTimeout(() => {
              const error = new Error("Job timed out");
              errorHandler?.(error);
              throw error;
            }, job.data.meta.timeout);
          const handler = jobs[job.name as keyof Jobs];
          if (!handler) {
            const error = new Error(`Unknown job: ${job.name}`);
            errorHandler?.(error);
            throw error;
          }
          try {
            await service.started(job);

            const result = await handler.run(job);
            if (result.isErr()) {
              await handler.onFailure?.(job, result.error);
              const error = new Error(result.error.message);
              errorHandler?.(error);
              throw error;
            }
            await handler.onSuccess?.(job).catch((err: unknown) => {
              const error = new Error(`Job ${job.id}:${job.name} failed to run onSuccess: ${err}`);
              logger.error(error.message);
              errorHandler?.(error);
            });
            return result.value ?? null;
          } catch (err) {
            await handler.onFailure?.(job, err).catch((err: unknown) => {
              const error = new Error(`Job ${job.id}:${job.name} failed to run onFailure: ${err}`);
              logger.error(error.message);
              errorHandler?.(error);
            });
            if (err instanceof Error && err.message === "Job timed out")
              logger.error(`Job ${job.id}:${job.name} timed out`);
            throw err;
          } finally {
            await handler.onComplete?.(job).catch((err: unknown) => {
              const error = new Error(`Job ${job.id}:${job.name} failed to run onComplete: ${err}`);
              logger.error(error.message);
              errorHandler?.(error);
            });
            if (timer) clearTimeout(timer);
          }
        }
      );
    },
    workerOptions as WorkerOptions
  );
  worker.on("completed", service.completed.bind(service));
  worker.on("failed", service.failed.bind(service));

  return worker;
}

export function createWorkflowWorkers<
  Jobs extends Record<string, WorkflowJob<WorkflowDataType<any>, any, string>>,
>(
  service: WorkflowService,
  workerSettings: Record<string, WorkerOptions>,
  jobs: Jobs,
  errorHandler?: (error: unknown) => void
) {
  const workers: Record<string, Worker> = {} as Record<string, Worker>;
  for (const [queueName, workerOptions] of Object.entries(workerSettings)) {
    workers[queueName] = createWorkflowWorker(
      service,
      queueName,
      workerOptions as WorkerOptions,
      jobs,
      errorHandler
    );
  }
  return workers;
}
