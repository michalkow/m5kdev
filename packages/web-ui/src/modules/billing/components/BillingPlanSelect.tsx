import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { formatPlanAmount } from "@m5kdev/commons/modules/billing/billing.utils";
import { BillingSinglePlanSelect } from "./BillingSinglePlanSelect";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
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
        <PlanCard key={plan.priceId} plan={plan} currency={currency} />
      ))}
    </div>
  );
}

function PlanCard({ plan, currency }: { plan: StripePlan; currency: string }) {
  const { serverUrl } = useAppConfig();
  const amount =
    plan.priceUnitAmount != null
      ? formatPlanAmount({ unitAmount: plan.priceUnitAmount, currency })
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
        <a
          className={cn(buttonVariants({ variant: "default" }), "w-full")}
          href={`${serverUrl}/stripe/checkout/${plan.priceId}`}
        >
          Subscribe monthly
        </a>
        {plan.annualDiscountPriceId ? (
          <a
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            href={`${serverUrl}/stripe/checkout/${plan.annualDiscountPriceId}`}
          >
            Subscribe annually
          </a>
        ) : null}
      </CardFooter>
    </Card>
  );
}
