import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { useQuery } from "@tanstack/react-query";
import { createContext } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";

export const billingProviderContext = createContext<{
  isLoading: boolean;
  data: BillingSchema | null;
}>({
  isLoading: true,
  data: null,
});

export function BillingProvider({
  children,
  loader,
  planPage,
  skipPlanCheck = false,
}: {
  children: React.ReactNode;
  loader?: React.ReactNode;
  planPage: React.ReactNode;
  skipPlanCheck?: boolean;
}) {
  const trpc = useAppTRPC<BackendTRPCRouter>();

  const { data: activeSubscription, isLoading } = useQuery(
    trpc.billing.getActiveSubscription.queryOptions(undefined, {
      staleTime: 1000 * 60 * 60 * 4, // 4 hours
      enabled: !skipPlanCheck,
    })
  );

  if (skipPlanCheck) {
    return (
      <billingProviderContext.Provider value={{ isLoading: false, data: null }}>
        {children}
      </billingProviderContext.Provider>
    );
  }

  // Show loading screen while checking subscription status
  if (isLoading) {
    return loader ? loader : "Loading...";
  }

  if (!activeSubscription) {
    return planPage;
  }

  return (
    <billingProviderContext.Provider value={{ isLoading, data: activeSubscription ?? null }}>
      {children}
    </billingProviderContext.Provider>
  );
}
