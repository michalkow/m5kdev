import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useSession } from "../../auth/hooks/useSession";

export { type EntitlementProviderValue, entitlementProviderContext } from "../entitlement.context";

import { entitlementProviderContext } from "../entitlement.context";

export function EntitlementProvider({ children }: { children: ReactNode }): ReactNode {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  const query = useQuery(
    trpc.billing.getEntitlements.queryOptions(organizationId ? { organizationId } : undefined, {
      enabled: Boolean(organizationId),
      placeholderData: undefined,
    })
  );

  return (
    <entitlementProviderContext.Provider
      value={{
        organizationId,
        snapshot:
          !query.isError && query.data?.organizationId === organizationId ? query.data : undefined,
        isPending: query.isPending || query.isLoading,
        isError: query.isError,
      }}
    >
      {children}
    </entitlementProviderContext.Provider>
  );
}
