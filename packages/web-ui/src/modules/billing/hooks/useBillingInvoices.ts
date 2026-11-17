import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
export function useBillingInvoices() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  return useQuery(
    trpc.billing.listInvoices.queryOptions(organizationId ? { organizationId } : undefined, {
      enabled: !!organizationId,
      placeholderData: undefined,
    })
  );
}
