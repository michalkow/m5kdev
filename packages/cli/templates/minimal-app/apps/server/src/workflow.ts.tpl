import { WorkflowRegistry } from "@m5kdev/backend/modules/workflow/workflow.registry";
import { WorkflowService } from "@m5kdev/backend/modules/workflow/workflow.service";
import IORedis from "ioredis";
import { workflowRepository } from "./repository";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const workflowService = new WorkflowService(workflowRepository, {
  connection,
  queues: {
    fast: { concurrency: 5 },
  },
  defaultQueue: "fast",
  defaults: {
    timeout: 60_000,
    jobOptions: { removeOnComplete: { age: 3600 } },
  },
});

export const workflowRegistry = new WorkflowRegistry(workflowService);
