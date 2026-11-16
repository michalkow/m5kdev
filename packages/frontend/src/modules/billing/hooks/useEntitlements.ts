import type { EntitlementDecisionReason } from "@m5kdev/commons/modules/billing/billing.schema";
import { useContext } from "react";
import { entitlementProviderContext } from "../entitlement.context";

export function useEntitlements() {
  const value = useContext(entitlementProviderContext);
  const snapshot =
    !value.isError && !value.isPending && value.snapshot?.organizationId === value.organizationId
      ? value.snapshot
      : undefined;
  return { ...value, snapshot, isPending: value.isPending || (!value.isError && !snapshot) };
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
    allowed: !isPending && !isError && decision?.allowed === true,
    isPending,
    isError: isError || (snapshot !== undefined && decision === undefined),
    reason: decision?.reason,
  };
}
