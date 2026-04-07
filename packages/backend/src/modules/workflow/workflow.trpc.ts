import {
  workflowListInputSchema,
  workflowListOutputSchema,
  workflowReadInputSchema,
  workflowReadOutputSchema,
} from "@m5kdev/commons/modules/workflow/workflow.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { WorkflowService } from "./workflow.service";

export function createWorkflowTRPC(
  { router, privateProcedure }: TRPCMethods,
  workflowService: WorkflowService,
) {
  return router({
    read: privateProcedure
      .input(workflowReadInputSchema)
      .output(workflowReadOutputSchema)
      .query(async ({ ctx, input }) =>
        handleTRPCResult(
          await workflowService.read({ ...input, userId: ctx.actor.userId }),
        ),
      ),

    list: privateProcedure
      .input(workflowListInputSchema)
      .output(workflowListOutputSchema)
      .query(async ({ ctx, input }) =>
        handleTRPCResult(
          await workflowService.list({ ...input, userId: ctx.actor.userId }),
        ),
      ),
  });
}
