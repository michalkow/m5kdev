export type StripePlan = {
  name: string;
  priceId: string;
  priceUnitAmount?: number;
  annualDiscountPriceId?: string;
  annualPriceUnitAmount?: number;
  freeTrial?: {
    days: number;
    seats?: number;
  };
};

export type StripePlansConfig = {
  currency: string;
  seatBilling?: boolean;
  nonBillableRoleKeys?: readonly string[];
  production: StripePlan[];
  sandbox: StripePlan[];
  trialPlanName?: string;
};

export type ResolvedStripePlans = {
  plans: StripePlan[];
  trial?: StripePlan;
  currency: string;
  seatBilling: boolean;
  nonBillableRoleKeys: readonly string[];
};
