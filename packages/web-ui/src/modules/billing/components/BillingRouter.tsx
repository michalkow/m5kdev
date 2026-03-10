import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { Route } from "react-router";
import { BillingInvoicePage } from "./BillingInvoicePage";
import type { UseBackendTRPC } from "../../../types";

interface BillingRouterProps {
  useTRPC?: UseBackendTRPC;
  serverUrl: string;
  plans: StripePlan[];
}

export function BillingRouter({ useTRPC, serverUrl }: BillingRouterProps) {
  if (!useTRPC) return null;

  return (
    <Route path="billing">
      <Route index element={<BillingInvoicePage useTRPC={useTRPC} serverUrl={serverUrl} />} />
    </Route>
  );
}
