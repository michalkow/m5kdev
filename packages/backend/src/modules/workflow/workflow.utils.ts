import type { Job } from "bullmq";
import { type ActorTelemetry, actorTelemetryFromJobData } from "../../utils/telemetry";
import type { JobsOptions } from "./workflow.types";

/** BullMQ preserves unknown option fields in Redis; handler data remains untouched. */
export type WorkflowJobOptions = JobsOptions & { m5kdev?: { userId: string } };

export function workflowActorTelemetry(
  job: Pick<Job, "data" | "opts"> | undefined
): ActorTelemetry {
  const actor = actorTelemetryFromJobData(job?.data);
  const userId = (job?.opts as WorkflowJobOptions | undefined)?.m5kdev?.userId;
  return typeof userId === "string" && userId.length > 0 ? { ...actor, userId } : actor;
}
