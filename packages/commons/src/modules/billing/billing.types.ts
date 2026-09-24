export type StripePlanPrice = {
  priceId: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  unitAmount?: number;
};

export type StripePlanProduct = {
  id: string;
  prices: StripePlanPrice[];
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
  seatBilling?: boolean;
  nonBillableRoleKeys?: readonly string[];
  production: StripePlan[];
  sandbox: StripePlan[];
  trialPlanName?: string;
};

export type ResolvedStripePlans = {
  plans: StripePlan[];
  trial?: StripePlan;
  defaultCurrency: string;
  seatBilling: boolean;
  nonBillableRoleKeys: readonly string[];
};
