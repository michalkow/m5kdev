import type { ServerResultAsync } from "@m5kdev/backend/modules/base/base.dto";
import { BaseService } from "@m5kdev/backend/modules/base/base.service";
import type { WorkflowService } from "@m5kdev/backend/modules/workflow/workflow.service";
import type { FireAndForgetJobDefinition } from "@m5kdev/backend/modules/workflow/workflow.types";
import type { Context } from "@m5kdev/backend/utils/trpc";
import { workflowTriggerOutputSchema } from "@m5kdev/commons/modules/workflow/workflow.schema";
import { ok } from "neverthrow";

const DEMO_PING_JOB_NAME = "demo.ping";

interface DemoPingJobPayload {
  readonly userId: string;
}

export class DemoWorkflowService extends BaseService<
  Record<string, never>,
  { workflow: WorkflowService },
  Context
> {
  readonly demoPingJob: FireAndForgetJobDefinition<DemoPingJobPayload>;

  constructor(services: { workflow: WorkflowService }) {
    super({}, services);

    this.demoPingJob = this.service.workflow
      .job<DemoPingJobPayload>({
        name: DEMO_PING_JOB_NAME,
        queue: "fast",
        meta: (payload) => ({ userId: payload.userId }),
      })
      .handle(async () => {
        // Completes immediately so the Starter webapp can observe a finished run.
      });
  }

  readonly runDemo = this.procedure("runDemo")
    .output(workflowTriggerOutputSchema)
    .requireAuth()
    .handle(async ({ ctx }): ServerResultAsync<{ jobId: string }> => {
      const jobId = await this.demoPingJob.trigger({ userId: ctx.actor.userId });
      return ok({ jobId });
    });
}
