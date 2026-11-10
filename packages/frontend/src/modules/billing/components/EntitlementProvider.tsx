import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { EntitlementSnapshot } from "@m5kdev/commons/modules/billing/billing.schema";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useSession } from "../../auth/hooks/useSession";

export interface EntitlementProviderValue {
  organizationId: string | undefined;
  snapshot: EntitlementSnapshot | undefined;
  isPending: boolean;
  isError: boolean;
}

export const entitlementProviderContext = createContext<EntitlementProviderValue>({
  organizationId: undefined,
  snapshot: undefined,
  isPending: true,
  isError: false,
});

export function EntitlementProvider({ children }: { children: ReactNode }): ReactNode {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  const query = useQuery(
    trpc.billing.getEntitlements.queryOptions(organizationId ? { organizationId } : undefined, {
      enabled: Boolean(organizationId),
    })
  );

  return (
    <entitlementProviderContext.Provider
      value={{
        organizationId,
        snapshot: query.data,
        isPending: query.isPending || query.isLoading,
        isError: query.isError,
      }}
    >
      {children}
    </entitlementProviderContext.Provider>
  );
}
