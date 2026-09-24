import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import {
  findMonthlyStandInPrice,
  formatBillingInterval,
  formatPlanAmount,
} from "@m5kdev/commons/modules/billing/billing.utils";
import { BillingSinglePlanSelect } from "./BillingSinglePlanSelect";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useSubscription } from "@m5kdev/frontend/modules/billing/hooks/useSubscription";
import { Check } from "lucide-react";
import { buttonVariants } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

interface BillingPlanSelectProps {
  plans: StripePlan[];
  currency: string;
}

export function BillingPlanSelect({ plans, currency }: BillingPlanSelectProps) {
  if (plans.length === 1) {
    const [plan] = plans;
    if (!plan) return null;
    return <BillingSinglePlanSelect plan={plan} currency={currency} />;
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard key={plan.name} plan={plan} currency={currency} />
      ))}
    </div>
  );
}

function PlanCard({ plan, currency }: { plan: StripePlan; currency: string }) {
  const { serverUrl } = useAppConfig();
  const { data: subscription } = useSubscription();
  const isTrialing = subscription?.status === "trialing";
  const prices = plan.products[currency]?.prices ?? [];
  const standIn = findMonthlyStandInPrice(plan, currency);
  const amount =
    standIn?.unitAmount != null
      ? formatPlanAmount({ unitAmount: standIn.unitAmount, currency })
      : prices[0]?.unitAmount != null
        ? formatPlanAmount({ unitAmount: prices[0].unitAmount, currency })
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
            className={cn(
              buttonVariants({ variant: price.priceId === standIn?.priceId ? "default" : "outline" }),
              "w-full"
            )}
            href={`${serverUrl}/stripe/${isTrialing ? "pick" : "checkout"}/${price.priceId}`}
          >
            {isTrialing ? "Choose " : "Subscribe "}
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
