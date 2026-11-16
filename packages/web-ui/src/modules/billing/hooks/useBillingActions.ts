import { toast } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

/** Browser POST supplies the Origin needed by a shared API before external navigation. */
export function useBillingActions() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: session } = useSession();
  const { t } = useTranslation("web-ui");
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  const checkout = useMutation(
    trpc.billing.startCheckout.mutationOptions({
      onError: () => toast.danger(t("billing.loadError")),
    })
  );
  const portal = useMutation(
    trpc.billing.startPortal.mutationOptions({
      onError: () => toast.danger(t("billing.loadError")),
    })
  );
  const startCheckout = async (priceId: string, returnPath?: string): Promise<boolean> => {
    if (!organizationId) return false;
    try {
      const result = await checkout.mutateAsync({ organizationId, priceId, returnPath });
      window.location.assign(result.url);
      return true;
    } catch {
      return false;
    }
  };
  const startPortal = async (returnPath?: string): Promise<boolean> => {
    if (!organizationId) return false;
    try {
      const result = await portal.mutateAsync({ organizationId, returnPath });
      window.location.assign(result.url);
      return true;
    } catch {
      return false;
    }
  };
  return {
    startCheckout,
    startPortal,
    canStart: !!organizationId,
    isCheckoutPending: checkout.isPending,
    isPortalPending: portal.isPending,
  };
}
