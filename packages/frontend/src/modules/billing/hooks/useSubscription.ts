import { useContext } from "react";
import { billingProviderContext } from "../components/BillingProvider";

export function useSubscription() {
  return useContext(billingProviderContext);
}
