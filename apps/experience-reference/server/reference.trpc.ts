import { handleTRPCResult, type TRPCMethods } from "@m5kdev/backend/utils/trpc";
import type { ReferenceService } from "./reference.service";
export function createReferenceTRPC(
  { router, organizationProcedure }: TRPCMethods,
  service: ReferenceService
) {
  return router({
    publish: organizationProcedure.mutation(async ({ ctx }) =>
      handleTRPCResult(await service.publish(undefined, ctx))
    ),
  });
}
