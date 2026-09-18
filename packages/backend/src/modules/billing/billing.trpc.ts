import { billingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { BillingService } from "./billing.service";

export function createBillingTRPC(
  { router, organizationProcedure }: TRPCMethods,
  billingService: BillingService
) {
  return router({
    getActiveSubscription: organizationProcedure
      .output(billingSchema.nullable())
      .query(async ({ ctx }) => {
        return handleTRPCResult(await billingService.getActiveSubscription(ctx));
      }),

    listInvoices: organizationProcedure.query(async ({ ctx }) => {
      return handleTRPCResult(await billingService.listInvoices(ctx));
    }),
  });
}
