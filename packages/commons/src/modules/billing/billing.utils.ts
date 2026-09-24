import type {
  ResolvedStripePlans,
  StripePlan,
  StripePlanPrice,
  StripePlansConfig,
} from "./billing.types";

export const getEnvironmentPlans = (
  plansConfig: StripePlansConfig,
  environment = "sandbox"
): ResolvedStripePlans => {
  const isProduction = environment === "production";
  const plans = isProduction ? plansConfig.production : plansConfig.sandbox;
  return {
    plans,
    trialPlanName: plansConfig.trialPlanName ?? {},
    trialRequiresPaymentMethod: plansConfig.trialRequiresPaymentMethod ?? false,
    defaultCurrency: plansConfig.defaultCurrency,
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

export function listPlanPrices(plan: StripePlan): StripePlanPrice[] {
  return Object.values(plan.products).flatMap((product) => product.prices);
}

export function catalogCurrencyKeys(plans: readonly StripePlan[]): string[] {
  const keys = new Set<string>();
  for (const plan of plans) {
    for (const currency of Object.keys(plan.products)) {
      keys.add(currency);
    }
  }
  return [...keys];
}

export function findPlanByPriceId(
  plans: readonly StripePlan[],
  priceId: string
): StripePlan | undefined {
  return plans.find((plan) => listPlanPrices(plan).some((price) => price.priceId === priceId));
}

export function findPriceCurrency(plan: StripePlan, priceId: string): string | undefined {
  for (const [currency, product] of Object.entries(plan.products)) {
    if (product.prices.some((price) => price.priceId === priceId)) return currency;
  }
  return undefined;
}

export function findTrialPlan({
  plans,
  trialPlanName,
  currency,
}: {
  plans: readonly StripePlan[];
  trialPlanName: Record<string, string>;
  currency: string;
}): StripePlan | undefined {
  const name = trialPlanName[currency];
  if (!name) return undefined;
  return plans.find((plan) => plan.name === name);
}

export function findDefaultTrialPrice({
  plan,
  currency,
}: {
  plan: StripePlan;
  currency: string;
}): StripePlanPrice | undefined {
  const product = plan.products[currency];
  if (!product?.defaultPriceId) return undefined;
  return product.prices.find((price) => price.priceId === product.defaultPriceId);
}

export function listPlanSelectPrices({
  plan,
  currency,
  trialRequiresPaymentMethod,
}: {
  plan: StripePlan;
  currency: string;
  trialRequiresPaymentMethod?: boolean;
}): StripePlanPrice[] {
  const product = plan.products[currency];
  if (!product) return [];
  if (trialRequiresPaymentMethod && product.defaultPriceId) {
    return product.prices.filter((price) => price.priceId === product.defaultPriceId);
  }
  return product.prices;
}

export function formatBillingInterval({
  interval,
  intervalCount,
}: {
  interval?: string | null;
  intervalCount?: number | null;
}): string {
  const count = intervalCount ?? 1;
  if (!interval) return "";
  if (count === 1 && interval === "month") return "Monthly";
  if (count === 1 && interval === "year") return "Yearly";
  if (count === 1 && interval === "week") return "Weekly";
  if (count === 1 && interval === "day") return "Daily";
  if (interval === "month" && count === 3) return "Every 3 months";
  return `Every ${count} ${interval}${count === 1 ? "" : "s"}`;
}
