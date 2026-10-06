import {
  activeSubscriptionSchema,
  applyAdminCouponInputSchema,
  billingAdminListInputSchema,
  billingAdminListOutputSchema,
  billingCouponListOutputSchema,
  cancelAdminSubscriptionInputSchema,
  createAdminSubscriptionInputSchema,
  organizationIdInputSchema,
  setAdminAllowCardlessTrialInputSchema,
  setAdminBillingExemptInputSchema,
  setOrganizationCurrencyInputSchema,
} from "@m5kdev/commons/modules/billing/billing.schema";
import { z } from "zod";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import type { BillingService } from "./billing.service";

export function createBillingTRPC(
  { router, organizationProcedure, adminProcedure }: TRPCMethods,
  billingService: BillingService
) {
  return router({
    getActiveSubscription: organizationProcedure
      .output(activeSubscriptionSchema.nullable())
      .query(async ({ ctx }) => {
        return handleTRPCResult(await billingService.getActiveSubscription(ctx));
      }),

    getTrialPriceId: organizationProcedure.output(z.string().nullable()).query(async ({ ctx }) => {
      return handleTRPCResult(await billingService.getTrialPriceId(ctx));
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

    listAdminCoupons: adminProcedure
      .output(billingCouponListOutputSchema)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await billingService.listAdminCoupons(undefined, ctx));
      }),

    createAdminCustomer: adminProcedure
      .input(organizationIdInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.createAdminCustomer(input, ctx));
      }),

    setAdminOrganizationCurrency: adminProcedure
      .input(setOrganizationCurrencyInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.setAdminOrganizationCurrency(input, ctx));
      }),

    setAdminBillingExempt: adminProcedure
      .input(setAdminBillingExemptInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.setAdminBillingExempt(input, ctx));
      }),

    setAdminAllowCardlessTrial: adminProcedure
      .input(setAdminAllowCardlessTrialInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.setAdminAllowCardlessTrial(input, ctx));
      }),

    createAdminSubscription: adminProcedure
      .input(createAdminSubscriptionInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.createAdminSubscription(input, ctx));
      }),

    applyAdminCoupon: adminProcedure
      .input(applyAdminCouponInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.applyAdminCoupon(input, ctx));
      }),

    removeAdminCoupon: adminProcedure
      .input(organizationIdInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.removeAdminCoupon(input, ctx));
      }),

    cancelAdminSubscription: adminProcedure
      .input(cancelAdminSubscriptionInputSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await billingService.cancelAdminSubscription(input, ctx));
      }),
  });
}
