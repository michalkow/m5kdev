import { billingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import type { BillingService } from "#modules/billing/billing.service";
import { handleTRPCResult, procedure, router } from "#trpc";

export function createBillingTRPC(billingService: BillingService) {
  return router({
    getActiveSubscription: procedure
      .output(billingSchema.nullable())
      .query(async ({ ctx: { user } }) => {
        return handleTRPCResult(await billingService.getActiveSubscription({ user }));
      }),

    listInvoices: procedure.query(async ({ ctx: { user } }) => {
      return handleTRPCResult(await billingService.listInvoices({ user }));
    }),
  });
}
