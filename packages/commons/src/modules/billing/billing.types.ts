export type StripePlan = {
  name: string;
  priceId: string;
  priceUnitAmount?: number;
  annualDiscountPriceId?: string;
  annualPriceUnitAmount?: number;
  freeTrial?: {
    days: number;
  };
  limits?: Record<string, number>;
  group?: string;
};

export type StripePlansConfig = {
  production: StripePlan[];
  sandbox: StripePlan[];
  trialPlanName?: string;
};
