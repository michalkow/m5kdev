import type { AuthService } from "./modules/auth/auth.service";
import { createAuthTRPC } from "./modules/auth/auth.trpc";
import type { BillingService } from "./modules/billing/billing.service";
import { createBillingTRPC } from "./modules/billing/billing.trpc";
import type { TRPCMethods } from "./utils/trpc";

export const createAuthTRPCRouter = (
  trpcMethods: TRPCMethods,
  authService: AuthService,
  billingService: BillingService
) =>
  trpcMethods.router({
    auth: createAuthTRPC(trpcMethods, authService),
    billing: createBillingTRPC(trpcMethods, billingService),
  });

export type BackendTRPCRouter = ReturnType<typeof createAuthTRPCRouter>;
