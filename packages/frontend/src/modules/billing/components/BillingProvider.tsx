import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { useQuery } from "@tanstack/react-query";
import { createContext } from "react";
import type { UseBackendTRPC } from "#types";

export const billingProviderContext = createContext<{
  isLoading: boolean;
  data: BillingSchema | null;
}>({
  isLoading: true,
  data: null,
});

export function BillingProvider({
  useTRPC,
  children,
  loader,
  planPage,
  skipPlanCheck = false,
}: {
  useTRPC: UseBackendTRPC;
  children: React.ReactNode;
  loader?: React.ReactNode;
  planPage: React.ReactNode;
  skipPlanCheck?: boolean;
}) {
  const trpc = useTRPC();

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
