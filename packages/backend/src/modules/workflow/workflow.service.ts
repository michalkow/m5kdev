import type {
  WorkflowListInputSchema,
  WorkflowListOutputSchema,
  WorkflowReadInputSchema,
  WorkflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import type { Job } from "bullmq";
import type { User } from "#modules/auth/auth.lib";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";
import type { WorkflowRepository } from "#modules/workflow/workflow.repository";
export class WorkflowService extends BaseService<{ workflow: WorkflowRepository }, never> {
  async read(
    input: WorkflowReadInputSchema,
    { user }: { user: User }
  ): ServerResultAsync<WorkflowReadOutputSchema> {
    return await this.repository.workflow.read({ ...input, userId: user.id });
  }

  async list(
    input: WorkflowListInputSchema,
    { user }: { user: User }
  ): ServerResultAsync<WorkflowListOutputSchema> {
    return await this.repository.workflow.list({ ...input, userId: user.id });
  }

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
