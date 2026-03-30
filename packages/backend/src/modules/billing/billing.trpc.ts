import { billingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { BillingService } from "./billing.service";

export function createBillingTRPC(
  { router, privateProcedure: procedure }: TRPCMethods,
  billingService: BillingService
) {
  return router({
    getActiveSubscription: procedure.output(billingSchema.nullable()).query(async ({ ctx }) => {
      return handleTRPCResult(await billingService.getActiveSubscription(ctx));
    }),

    listInvoices: procedure.query(async ({ ctx }) => {
      return handleTRPCResult(await billingService.listInvoices(ctx));
    }),
  });
}
