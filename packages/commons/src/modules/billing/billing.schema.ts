import { z } from "zod";

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
  trialStart: z.date().nullish(),
  trialEnd: z.date().nullish(),
  priceId: z.string().nullish(),
  interval: z.string().nullish(),
  unitAmount: z.number().nullish(),
  discounts: z.array(z.string()).nullish(),
});

export type BillingSchema = z.infer<typeof billingSchema>;
