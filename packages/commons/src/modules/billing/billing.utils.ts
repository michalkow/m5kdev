import type { StripePlan, StripePlansConfig } from "./billing.types";

export const getEnvironmentPlans = (
  plansConfig: StripePlansConfig,
  environment = "sandbox"
): { plans: StripePlan[]; trial: StripePlan | undefined } => {
  const isProduction = environment === "production";
  const plans = isProduction ? plansConfig.production : plansConfig.sandbox;
  const trial = plansConfig.trialPlanName
    ? plans.find((plan) => plan.name === plansConfig.trialPlanName)
    : undefined;
  return { plans, trial };
};
