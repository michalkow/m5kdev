import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { Route } from "react-router";
import { BillingAdminPage } from "./BillingAdminPage";

export function BillingAdminRouter({
  plans,
  trialRequiresPaymentMethod = false,
}: {
  plans: readonly StripePlan[];
  trialRequiresPaymentMethod?: boolean;
}) {
  return (
    <Route
      path="/admin/billing"
      element={
        <BillingAdminPage plans={plans} trialRequiresPaymentMethod={trialRequiresPaymentMethod} />
      }
    />
  );
}
