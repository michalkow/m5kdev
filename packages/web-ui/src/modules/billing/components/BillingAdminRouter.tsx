import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { Route } from "react-router";
import { BillingAdminPage } from "./BillingAdminPage";

export function BillingAdminRouter({ plans }: { plans: readonly StripePlan[] }) {
  return <Route path="/admin/billing" element={<BillingAdminPage plans={plans} />} />;
}
