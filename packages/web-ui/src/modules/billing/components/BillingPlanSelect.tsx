import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { BillingSinglePlanSelect } from "./BillingSinglePlanSelect";

interface BillingPlanSelectProps {
  plans: StripePlan[];
}

export function BillingPlanSelect({ plans }: BillingPlanSelectProps) {
  if (plans.length === 1) {
    return <BillingSinglePlanSelect plan={plans[0]} />;
  }

  return "Multiple plans selection not implemented yet";
}
