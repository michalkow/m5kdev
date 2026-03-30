import type {
  WorkflowListInputSchema,
  WorkflowListOutputSchema,
  WorkflowReadInputSchema,
  WorkflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import type { Job } from "bullmq";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type { WorkflowRepository } from "./workflow.repository";

export class WorkflowService extends BaseService<{ workflow: WorkflowRepository }, never> {
  readonly read = this.procedure<WorkflowReadInputSchema>("workflowRead")
    .requireAuth()
    .handle(
      ({ input, ctx }): ServerResultAsync<WorkflowReadOutputSchema> =>
        this.repository.workflow.read({ ...input, userId: ctx.actor.userId })
    );

  readonly list = this.procedure<WorkflowListInputSchema>("workflowList")
    .requireAuth()
    .handle(
      ({ input, ctx }): ServerResultAsync<WorkflowListOutputSchema> =>
        this.repository.workflow.list({ ...input, userId: ctx.actor.userId })
    );

  async added(
    params: Parameters<WorkflowRepository["added"]>[0]
  ): ServerResultAsync<WorkflowReadOutputSchema> {
    return this.repository.workflow.added(params);
  }

  async addedMany(
    params: Parameters<WorkflowRepository["addedMany"]>[0]
  ): ServerResultAsync<WorkflowReadOutputSchema[]> {
    return this.repository.workflow.addedMany(params);
  }

  async started(job: Job): ServerResultAsync<WorkflowReadOutputSchema> {
    if (!job.id) return this.error("INTERNAL_SERVER_ERROR");
    return this.repository.workflow.started({ jobId: job.id });
  }

  async failed(job?: Job, error?: Error): ServerResultAsync<WorkflowReadOutputSchema> {
    if (!job?.id) return this.error("INTERNAL_SERVER_ERROR");
    return this.repository.workflow.failed({
      jobId: job.id,
      error: error?.message || "Unknown error",
    });
  }

  async completed(job: Job): ServerResultAsync<WorkflowReadOutputSchema> {
    if (!job.id) return this.error("INTERNAL_SERVER_ERROR");
    return this.repository.workflow.completed({ jobId: job.id, output: job.returnvalue });
  }
}
