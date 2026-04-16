import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { Route } from "react-router";
import { BillingInvoicePage } from "./BillingInvoicePage";

interface BillingRouterProps {
  plans: StripePlan[];
}

export function BillingRouter(_props: BillingRouterProps) {
  return (
    <Route path="billing">
      <Route index element={<BillingInvoicePage />} />
    </Route>
  );
}
