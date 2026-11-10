import { unknownCapabilities } from "@m5kdev/commons/modules/billing/billing.entitlements";
import { useEntitlements } from "@m5kdev/frontend/modules/billing/hooks/useEntitlements";
import type { ReactNode } from "react";

export interface EntitlementGateProps {
  capabilities: readonly string[];
  pending?: ReactNode;
  error?: ReactNode;
  denied?: ReactNode;
  children: ReactNode;
}

export function EntitlementGate({
  capabilities,
  pending,
  error,
  denied,
  children,
}: EntitlementGateProps): ReactNode {
  const { snapshot, isPending, isError } = useEntitlements();

  if (isError) return error ?? null;
  if (isPending || !snapshot) return pending ?? null;

  const unknown = unknownCapabilities(snapshot.capabilities, capabilities);
  if (unknown.length > 0) return error ?? null;

  const allowed = capabilities.every(
    (capability) => snapshot.capabilities[capability]?.allowed === true
  );
  if (!allowed) return denied ?? null;

  return children;
}
