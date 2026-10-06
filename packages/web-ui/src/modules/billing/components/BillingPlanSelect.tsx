import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import {
  formatBillingInterval,
  formatPlanAmount,
  listPlanSelectPrices,
  resolveTrialDays,
} from "@m5kdev/commons/modules/billing/billing.utils";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { BillingSinglePlanSelect } from "./BillingSinglePlanSelect";
import { BillingTrialBadge, billingPlanCtaLabel } from "./billingPlanTrial";

interface BillingPlanSelectProps {
  plans: StripePlan[];
  currency: string;
  trialRequiresPaymentMethod?: boolean;
  trialPlanName?: string;
}

function listedPlans({
  plans,
  trialRequiresPaymentMethod,
  trialPlanName,
}: BillingPlanSelectProps): StripePlan[] {
  if (trialRequiresPaymentMethod && trialPlanName) {
    return plans.filter((plan) => plan.name === trialPlanName);
  }
  return plans;
}

export function BillingPlanSelect(props: BillingPlanSelectProps) {
  const plans = listedPlans(props);
  const { currency, trialRequiresPaymentMethod } = props;
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: trialPriceId } = useQuery(
    trpc.billing.getTrialPriceId.queryOptions(undefined, {
      enabled: Boolean(trialRequiresPaymentMethod),
    })
  );
  if (plans.length === 1) {
    const [plan] = plans;
    if (!plan) return null;
    return (
      <BillingSinglePlanSelect
        plan={plan}
        currency={currency}
        trialRequiresPaymentMethod={trialRequiresPaymentMethod}
        trialPriceId={trialPriceId}
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard
          key={plan.name}
          plan={plan}
          currency={currency}
          trialRequiresPaymentMethod={trialRequiresPaymentMethod}
          trialPriceId={trialPriceId}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  currency,
  trialRequiresPaymentMethod,
  trialPriceId,
}: {
  plan: StripePlan;
  currency: string;
  trialRequiresPaymentMethod?: boolean;
  trialPriceId?: string | null;
}) {
  const { t } = useTranslation("web-ui");
  const { serverUrl } = useAppConfig();
  const prices = listPlanSelectPrices({
    plan,
    currency,
    trialRequiresPaymentMethod,
    trialPriceId,
  });
  const displayPrice = prices[0];
  const amount =
    displayPrice?.unitAmount != null
      ? formatPlanAmount({ unitAmount: displayPrice.unitAmount, currency })
      : "";
  const displayTrialDays = displayPrice
    ? resolveTrialDays({ plan, price: displayPrice })
    : undefined;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {amount ? <p className="text-3xl font-bold">{amount}</p> : null}
        <BillingTrialBadge days={displayTrialDays} />
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {prices.map((price) => {
          const trialDays = resolveTrialDays({ plan, price });
          return (
            <a
              key={price.priceId}
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
              href={`${serverUrl}/stripe/checkout/${price.priceId}`}
            >
              {billingPlanCtaLabel({ trialRequiresPaymentMethod, trialDays, t })}{" "}
              {formatBillingInterval({
                interval: price.interval,
                intervalCount: price.intervalCount,
              }).toLowerCase()}
            </a>
          );
        })}
      </CardFooter>
    </Card>
  );
}
