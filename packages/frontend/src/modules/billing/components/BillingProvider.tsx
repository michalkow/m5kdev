import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { ActiveSubscription } from "@m5kdev/commons/modules/billing/billing.schema";
import { useQuery } from "@tanstack/react-query";
import i18n from "i18next";
import { createContext } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useSession } from "../../auth/hooks/useSession";
import { useUserOrganizations } from "../../auth/hooks/useUserOrganizations";

export const billingProviderContext = createContext<{
  isLoading: boolean;
  isError?: boolean;
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
  errorPage,
  skipPlanCheck = false,
}: {
  children: React.ReactNode;
  loader?: React.ReactNode;
  planPage: React.ReactNode;
  paymentMethodPage?: React.ReactNode;
  errorPage?: React.ReactNode;
  skipPlanCheck?: boolean;
}): React.ReactNode {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: session } = useSession();
  const organizations = useUserOrganizations();
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  const billingExempt = Boolean(
    organizations.data?.find(
      (organization) => organization.id === session?.session.activeOrganizationId
    )?.billingExempt
  );
  const skipSubscriptionQuery =
    skipPlanCheck ||
    organizations.isPending ||
    organizations.isError ||
    billingExempt ||
    !organizationId;

  const subscription = useQuery(
    trpc.billing.getActiveSubscription.queryOptions(
      organizationId ? { organizationId } : undefined,
      {
        placeholderData: undefined,
        staleTime: 1000 * 60 * 60 * 4, // 4 hours
        enabled: !skipSubscriptionQuery,
      }
    )
  );

  const activeSubscription =
    !subscription.isError && subscription.data?.referenceId === organizationId
      ? subscription.data
      : undefined;
  if (skipPlanCheck) {
    return (
      <billingProviderContext.Provider value={{ isLoading: false, data: null }}>
        {children}
      </billingProviderContext.Provider>
    );
  }

  if (organizations.isError || (!billingExempt && subscription.isError)) {
    return (
      errorPage ?? (
        <p role="alert">
          {i18n.t("web-ui:billing.loadError", {
            defaultValue: "Unable to load billing. Try again.",
          })}
        </p>
      )
    );
  }

  if (organizations.isPending || !organizationId) {
    return loader ? loader : "Loading...";
  }

  if (billingExempt) {
    return (
      <billingProviderContext.Provider value={{ isLoading: false, data: null }}>
        {children}
      </billingProviderContext.Provider>
    );
  }

  if (subscription.isPending) {
    return loader ? loader : "Loading...";
  }

  if (!activeSubscription) {
    return planPage;
  }

  if (activeSubscription.ownerMustAddPaymentMethod) {
    return paymentMethodPage ?? "Add a payment method";
  }

  return (
    <billingProviderContext.Provider value={{ isLoading: false, data: activeSubscription }}>
      {children}
    </billingProviderContext.Provider>
  );
}
