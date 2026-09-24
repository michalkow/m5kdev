import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import {
  formatBillingInterval,
  formatPlanAmount,
  listPlanSelectPrices,
} from "@m5kdev/commons/modules/billing/billing.utils";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { Check } from "lucide-react";
import { buttonVariants } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { BillingSinglePlanSelect } from "./BillingSinglePlanSelect";

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
  if (plans.length === 1) {
    const [plan] = plans;
    if (!plan) return null;
    return (
      <BillingSinglePlanSelect
        plan={plan}
        currency={currency}
        trialRequiresPaymentMethod={trialRequiresPaymentMethod}
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
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  currency,
  trialRequiresPaymentMethod,
}: {
  plan: StripePlan;
  currency: string;
  trialRequiresPaymentMethod?: boolean;
}) {
  const { serverUrl } = useAppConfig();
  const prices = listPlanSelectPrices({ plan, currency, trialRequiresPaymentMethod });
  const displayPrice = prices[0];
  const amount =
    displayPrice?.unitAmount != null
      ? formatPlanAmount({ unitAmount: displayPrice.unitAmount, currency })
      : "";

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {amount ? <p className="text-3xl font-bold">{amount}</p> : null}
        {plan.freeTrial?.days ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-3 w-3" />
            {plan.freeTrial.days}-day Trial
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {prices.map((price) => (
          <a
            key={price.priceId}
            className={cn(buttonVariants({ variant: "default" }), "w-full")}
            href={`${serverUrl}/stripe/checkout/${price.priceId}`}
          >
            {trialRequiresPaymentMethod ? "Start Trial " : "Subscribe "}
            {formatBillingInterval({
              interval: price.interval,
              intervalCount: price.intervalCount,
            }).toLowerCase()}
          </a>
        ))}
      </CardFooter>
    </Card>
  );
}
