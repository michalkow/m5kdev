import type { z } from "zod";
import type { EntitlementCatalog } from "./billing.entitlements";
import type { stripeEnvironmentSchema } from "./billing.schema";

export type StripePlanPrice = {
  priceId: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  unitAmount?: number;
  /** 0 means no trial for this Price. Omit to fall back to plan `freeTrial.days`. */
  freeTrialDays?: number;
};

export type StripePlanProduct = {
  id: string;
  prices: StripePlanPrice[];
  defaultPriceId?: string;
};

export type StripePlan = {
  name: string;
  products: Record<string, StripePlanProduct>;
  freeTrial?: {
    days: number;
    seats?: number;
  };
  /** Immutable Bundle revisions this Plan contributes when ACCESS_STATUS. Omitted means none. */
  bundles?: readonly string[];
};

export type StripePlansConfig = {
  defaultCurrency: string;
  trialRequiresPaymentMethod?: boolean;
  trialPlanName?: Record<string, string>;
  seatBilling?: boolean;
  nonBillableRoleKeys?: readonly string[];
  production: StripePlan[];
  sandbox: StripePlan[];
  entitlements?: EntitlementCatalog;
};

export type StripeEnvironment = z.infer<typeof stripeEnvironmentSchema>;

export type ResolvedStripePlans = {
  environment: StripeEnvironment;
  plans: StripePlan[];
  trialPlanName: Record<string, string>;
  trialRequiresPaymentMethod: boolean;
  defaultCurrency: string;
  seatBilling: boolean;
  nonBillableRoleKeys: readonly string[];
  entitlements?: EntitlementCatalog;
};
