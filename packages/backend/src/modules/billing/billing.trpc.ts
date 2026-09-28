import {
  billingAdminListInputSchema,
  billingAdminListOutputSchema,
  billingSchema,
  cancelAdminSubscriptionInputSchema,
  enrollComplimentaryInputSchema,
  organizationIdInputSchema,
} from "@m5kdev/commons/modules/billing/billing.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { BillingService } from "./billing.service";

export function createBillingTRPC(
  { router, organizationProcedure, adminProcedure }: TRPCMethods,
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

    listAdminOrganizationBilling: adminProcedure
      .input(billingAdminListInputSchema)
      .output(billingAdminListOutputSchema)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.listAdminOrganizationBilling(input, ctx));
      }),

    enrollComplimentary: adminProcedure
      .input(enrollComplimentaryInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.enrollComplimentary(input, ctx));
      }),

    removeComplimentary: adminProcedure
      .input(organizationIdInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.removeComplimentary(input, ctx));
      }),

    cancelAdminSubscription: adminProcedure
      .input(cancelAdminSubscriptionInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.cancelAdminSubscription(input, ctx));
      }),
  });
}
