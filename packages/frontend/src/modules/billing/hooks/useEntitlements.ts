import type { EntitlementDecisionReason } from "@m5kdev/commons/modules/billing/billing.schema";
import { useContext } from "react";
import { entitlementProviderContext } from "../components/EntitlementProvider";

export function useEntitlements() {
  return useContext(entitlementProviderContext);
}

export function useEntitlement(capability: string): {
  allowed: boolean;
  isPending: boolean;
  isError: boolean;
  reason: EntitlementDecisionReason | undefined;
} {
  const { snapshot, isPending, isError } = useEntitlements();
  const decision = snapshot?.capabilities[capability];
  return {
    allowed: decision?.allowed === true,
    isPending,
    isError: isError || (snapshot !== undefined && decision === undefined),
    reason: decision?.reason,
  };
}
