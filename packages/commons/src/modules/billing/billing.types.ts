export type StripePlanPrice = {
  priceId: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  unitAmount?: number;
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
};

export type StripePlansConfig = {
  defaultCurrency: string;
  trialRequiresPaymentMethod?: boolean;
  trialPlanName?: Record<string, string>;
  seatBilling?: boolean;
  nonBillableRoleKeys?: readonly string[];
  production: StripePlan[];
  sandbox: StripePlan[];
};

export type ResolvedStripePlans = {
  plans: StripePlan[];
  trialPlanName: Record<string, string>;
  trialRequiresPaymentMethod: boolean;
  defaultCurrency: string;
  seatBilling: boolean;
  nonBillableRoleKeys: readonly string[];
};
