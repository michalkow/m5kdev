import type { AuthService } from "@m5kdev/backend/modules/auth/auth.service";
import type { ServerResultAsync } from "@m5kdev/backend/modules/base/base.dto";
import { BaseService } from "@m5kdev/backend/modules/base/base.service";
import type { WorkflowService } from "@m5kdev/backend/modules/workflow/workflow.service";
import type { FireAndForgetJobDefinition } from "@m5kdev/backend/modules/workflow/workflow.types";
import type { Context } from "@m5kdev/backend/utils/trpc";
import { workflowTriggerOutputSchema } from "@m5kdev/commons/modules/workflow/workflow.schema";
import { DEMO_WORKFLOW_SERVER_EVENT_RESOURCE } from "@starter-app/shared/modules/demo-workflow/demo-workflow.constants";
import { ok } from "neverthrow";

const DEMO_PING_JOB_NAME = "demo.ping";

interface DemoPingJobPayload {
  readonly userId: string;
}

export class DemoWorkflowService extends BaseService<
  Record<string, never>,
  { workflow: WorkflowService; auth: AuthService },
  Context
> {
  readonly demoPingJob: FireAndForgetJobDefinition<DemoPingJobPayload>;

  constructor(services: { workflow: WorkflowService; auth: AuthService }) {
    super({}, services);

    this.demoPingJob = this.service.workflow
      .job<DemoPingJobPayload>({
        name: DEMO_PING_JOB_NAME,
        queue: "fast",
        meta: (payload) => ({ userId: payload.userId }),
      })
      .handle(async (payload) => {
        this.service.auth.userEmit({
          userId: payload.userId,
          resource: DEMO_WORKFLOW_SERVER_EVENT_RESOURCE,
          id: DEMO_PING_JOB_NAME,
          change: "updated",
          organizationId: null,
        });
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
