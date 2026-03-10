// Create a faux router that includes the auth router for use in the web-ui types
import type { Mastra } from "@mastra/core";
import type { AIService } from "#modules/ai/ai.service";
import { createAITRPC } from "#modules/ai/ai.trpc";
import type { AuthService } from "#modules/auth/auth.service";
import { createAuthTRPC } from "#modules/auth/auth.trpc";
import type { BillingService } from "#modules/billing/billing.service";
import { createBillingTRPC } from "#modules/billing/billing.trpc";
import type { TRPCMethods } from "#utils/trpc";

export const createAuthTRPCRouter = <MastraInstance extends Mastra>(
  trpcMethods: TRPCMethods,
  authService: AuthService,
  aiService: AIService<MastraInstance>,
  billingService: BillingService
) =>
  trpcMethods.router({
    auth: createAuthTRPC(trpcMethods, authService),
    ai: createAITRPC(trpcMethods, aiService),
    billing: createBillingTRPC(trpcMethods, billingService),
  });

export type BackendTRPCRouter = ReturnType<typeof createAuthTRPCRouter>;
