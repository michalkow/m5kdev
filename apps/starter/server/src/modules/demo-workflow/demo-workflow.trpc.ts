import { handleTRPCResult, type TRPCMethods } from "@m5kdev/backend/utils/trpc";
import { workflowTriggerOutputSchema } from "@m5kdev/commons/modules/workflow/workflow.schema";
import type { DemoWorkflowService } from "./demo-workflow.service";

export function createDemoWorkflowTRPC(
  { router, privateProcedure }: TRPCMethods,
  demoWorkflowService: DemoWorkflowService
) {
  return router({
    run: privateProcedure
      .output(workflowTriggerOutputSchema)
      .mutation(async ({ ctx }) =>
        handleTRPCResult(await demoWorkflowService.runDemo(undefined, ctx))
      ),
  });
}
