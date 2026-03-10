import {
  workflowListInputSchema,
  workflowListOutputSchema,
  workflowReadInputSchema,
  workflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import type { WorkflowService } from "#modules/workflow/workflow.service";
import { handleTRPCResult, type TRPCMethods } from "#utils/trpc";

export function createWorkflowTRPC(
  { router, privateProcedure: procedure }: TRPCMethods,
  workflowService: WorkflowService
) {
  return router({
    read: procedure
      .input(workflowReadInputSchema)
      .output(workflowReadOutputSchema)
      .query(async ({ ctx, input }) => {
        return handleTRPCResult(await workflowService.read(input, ctx));
      }),

    list: procedure
      .input(workflowListInputSchema)
      .output(workflowListOutputSchema)
      .query(async ({ ctx, input }) => {
        return handleTRPCResult(await workflowService.list(input, ctx));
      }),
  });
}
