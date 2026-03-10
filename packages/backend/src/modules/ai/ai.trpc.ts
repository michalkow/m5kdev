import type { Mastra } from "@mastra/core";
import { z } from "zod";
import type { AIService } from "./ai.service";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";

export function createAITRPC<MastraInstance extends Mastra>(
  { router, adminProcedure }: TRPCMethods,
  aiService: AIService<MastraInstance>
) {
  return router({
    getUserUsage: adminProcedure
      .input(z.object({ userId: z.string() }))
      .output(
        z.object({
          inputTokens: z.number().nullable(),
          outputTokens: z.number().nullable(),
          totalTokens: z.number().nullable(),
          cost: z.number().nullable(),
        })
      )
      .query(async ({ input }) => {
        return handleTRPCResult(await aiService.getUsage(input.userId));
      }),
  });
}
