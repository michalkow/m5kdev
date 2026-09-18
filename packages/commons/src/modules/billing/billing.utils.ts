import type { ResolvedStripePlans, StripePlansConfig } from "./billing.types";

export const getEnvironmentPlans = (
  plansConfig: StripePlansConfig,
  environment = "sandbox"
): ResolvedStripePlans => {
  const isProduction = environment === "production";
  const plans = isProduction ? plansConfig.production : plansConfig.sandbox;
  const trial = plansConfig.trialPlanName
    ? plans.find((plan) => plan.name === plansConfig.trialPlanName)
    : undefined;
  return {
    plans,
    trial,
    currency: plansConfig.currency,
    seatBilling: plansConfig.seatBilling ?? false,
    nonBillableRoleKeys: plansConfig.nonBillableRoleKeys ?? [],
  };
};

export const formatPlanAmount = ({
  unitAmount,
  currency,
}: {
  unitAmount: number;
  currency: string;
}): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100);
};
