import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { ActiveSubscription } from "@m5kdev/commons/modules/billing/billing.schema";
import { useQuery } from "@tanstack/react-query";
import { createContext } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useSession } from "../../auth/hooks/useSession";
import { useUserOrganizations } from "../../auth/hooks/useUserOrganizations";

export const billingProviderContext = createContext<{
  isLoading: boolean;
  data: ActiveSubscription | null;
}>({
  isLoading: true,
  data: null,
});

export function BillingProvider({
  children,
  loader,
  planPage,
  paymentMethodPage,
  skipPlanCheck = false,
}: {
  children: React.ReactNode;
  loader?: React.ReactNode;
  planPage: React.ReactNode;
  paymentMethodPage?: React.ReactNode;
  skipPlanCheck?: boolean;
}): React.ReactNode {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: session } = useSession();
  const organizations = useUserOrganizations();
  const billingExempt = Boolean(
    organizations.data?.find(
      (organization) => organization.id === session?.session.activeOrganizationId
    )?.billingExempt
  );
  const skipSubscriptionQuery = skipPlanCheck || organizations.isLoading || billingExempt;

  const { data: activeSubscription, isLoading } = useQuery(
    trpc.billing.getActiveSubscription.queryOptions(undefined, {
      staleTime: 1000 * 60 * 60 * 4, // 4 hours
      enabled: !skipSubscriptionQuery,
    })
  );

  if (skipPlanCheck) {
    return (
      <billingProviderContext.Provider value={{ isLoading: false, data: null }}>
        {children}
      </billingProviderContext.Provider>
    );
  }

  if (organizations.isLoading) {
    return loader ? loader : "Loading...";
  }

  if (billingExempt) {
    return (
      <billingProviderContext.Provider value={{ isLoading: false, data: null }}>
        {children}
      </billingProviderContext.Provider>
    );
  }

  if (isLoading) {
    return loader ? loader : "Loading...";
  }

  if (!activeSubscription) {
    return planPage;
  }

  if (activeSubscription.ownerMustAddPaymentMethod) {
    return paymentMethodPage ?? "Add a payment method";
  }

  return (
    <billingProviderContext.Provider value={{ isLoading, data: activeSubscription }}>
      {children}
    </billingProviderContext.Provider>
  );
}
