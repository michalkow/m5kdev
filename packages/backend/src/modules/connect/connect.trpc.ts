import { handleTRPCResult, procedure, router } from "#trpc";
import {
  connectDeleteInputSchema,
  connectDeleteOutputSchema,
  connectListInputSchema,
  connectListOutputSchema,
} from "./connect.dto";
import type { ConnectService } from "./connect.service";

export function createConnectTRPC(connectService: ConnectService) {
  return router({
    list: procedure
      .input(connectListInputSchema)
      .output(connectListOutputSchema)
      .query(async ({ ctx, input }) => {
        return handleTRPCResult(await connectService.list(input, ctx));
      }),

    delete: procedure
      .input(connectDeleteInputSchema)
      .output(connectDeleteOutputSchema)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await connectService.delete(input, ctx));
      }),
  });
}
