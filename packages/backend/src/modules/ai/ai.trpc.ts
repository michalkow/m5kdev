import type { Mastra } from "@mastra/core";
import { z } from "zod";
import type { AIService } from "#modules/ai/ai.service";
import { adminProcedure, handleTRPCResult, router } from "#trpc";

export function createAITRPC<MastraInstance extends Mastra>(aiService: AIService<MastraInstance>) {
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
