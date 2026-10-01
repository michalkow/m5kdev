import { z } from "zod";
import { queryListOutput, querySchema } from "../schemas/query.schema";

export const stripeEnvironmentSchema = z.enum(["production", "sandbox"]);

export const billingSchema = z.object({
  id: z.string(),
  plan: z.string(),
  referenceId: z.string(),
  stripeCustomerId: z.string().nullish(),
  stripeSubscriptionId: z.string().nullish(),
  status: z.string(),
  periodStart: z.date().nullish(),
  periodEnd: z.date().nullish(),
  cancelAtPeriodEnd: z.boolean().nullish(),
  cancelAt: z.date().nullish(),
  canceledAt: z.date().nullish(),
  seats: z.number().nullish(),
  memberId: z.string().nullish(),
  trialStart: z.date().nullish(),
  trialEnd: z.date().nullish(),
  priceId: z.string().nullish(),
  interval: z.string().nullish(),
  intervalCount: z.number().nullish(),
  intervalPicked: z.boolean().nullish(),
  unitAmount: z.number().nullish(),
  discounts: z.array(z.string()).nullish(),
  environment: stripeEnvironmentSchema.nullish(),
});

export type BillingSchema = z.infer<typeof billingSchema>;

export const billingCouponSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  percentOff: z.number().nullable(),
  amountOff: z.number().nullable(),
  currency: z.string().nullable(),
  duration: z.enum(["forever", "once", "repeating"]).nullable(),
  durationInMonths: z.number().nullable(),
  valid: z.boolean(),
});

export const billingCouponListOutputSchema = z.array(billingCouponSchema);

export const organizationIdInputSchema = z.object({
  organizationId: z.string(),
});

export const MAX_TRIAL_DAYS = 730;

export const createAdminSubscriptionInputSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  couponId: z.string().optional(),
  trialDays: z.number().int().min(1).max(MAX_TRIAL_DAYS).optional(),
});

export const applyAdminCouponInputSchema = z.object({
  organizationId: z.string(),
  couponId: z.string(),
});

export const setOrganizationCurrencyInputSchema = z.object({
  organizationId: z.string(),
  currency: z.string(),
});

export const setAdminBillingExemptInputSchema = z.object({
  organizationId: z.string(),
  billingExempt: z.boolean(),
});

export const cancelAdminSubscriptionInputSchema = z.object({
  organizationId: z.string(),
  when: z.enum(["immediate", "period_end"]),
});

export const adminOrganizationBillingRowSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  currency: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  defaultTrialDays: z.number().nullable(),
  billingExempt: z.boolean(),
  openSubscription: z.boolean(),
  subscription: billingSchema.nullable(),
  coupon: billingCouponSchema.nullable(),
});

export const billingAdminListInputSchema = querySchema;
export const billingAdminListOutputSchema = queryListOutput(
  adminOrganizationBillingRowSchema
).extend({
  environment: stripeEnvironmentSchema,
});

export type BillingCoupon = z.infer<typeof billingCouponSchema>;
export type CreateAdminSubscriptionInput = z.infer<typeof createAdminSubscriptionInputSchema>;
export type SetAdminBillingExemptInput = z.infer<typeof setAdminBillingExemptInputSchema>;
export type AdminOrganizationBillingRow = z.infer<typeof adminOrganizationBillingRowSchema>;
