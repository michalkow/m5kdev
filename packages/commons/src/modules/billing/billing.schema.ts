import { z } from "zod";
import { queryListOutput, querySchema } from "../schemas/query.schema";

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
});

export type BillingSchema = z.infer<typeof billingSchema>;

export const complimentaryDurationSchema = z.union([
  z.literal("forever"),
  z.literal("once"),
  z.object({ months: z.number().int().positive() }),
]);

export const enrollComplimentaryInputSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  duration: complimentaryDurationSchema,
});

export const organizationIdInputSchema = z.object({
  organizationId: z.string(),
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
  subscription: billingSchema.nullable(),
});

export const billingAdminListInputSchema = querySchema;
export const billingAdminListOutputSchema = queryListOutput(adminOrganizationBillingRowSchema);

export type ComplimentaryDuration = z.infer<typeof complimentaryDurationSchema>;
export type EnrollComplimentaryInput = z.infer<typeof enrollComplimentaryInputSchema>;
export type AdminOrganizationBillingRow = z.infer<typeof adminOrganizationBillingRowSchema>;
