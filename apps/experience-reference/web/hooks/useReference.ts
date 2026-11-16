import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReferenceRouter } from "../../server/fixture";
export function useReference() {
  const trpc = useAppTRPC<ReferenceRouter>();
  const auth = useAuthClient();
  const { data: session, registerSession } = useSession();
  const queryClient = useQueryClient();
  const [action, setAction] = useState("");
  const [switching, setSwitching] = useState(false);
  const preferences = useQuery(trpc.auth.getPreferences.queryOptions());
  const publish = useMutation(
    trpc.reference.publish.mutationOptions({
      onSuccess: () => setAction("published"),
      onError: () => setAction("grantDenied"),
    })
  );
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  const switchOrganization = async (organizationId: string) => {
    setSwitching(true);
    setAction("");
    try {
      const result = await auth.organization.setActive({ organizationId });
      if (result.error) throw new Error(result.error.message);
      await registerSession(undefined, { disableCookieCache: true });
    } finally {
      setSwitching(false);
    }
  };
  const refreshSubscription = () =>
    queryClient.invalidateQueries(
      trpc.billing.getActiveSubscription.queryFilter({ organizationId })
    );
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(
        trpc.billing.getActiveSubscription.queryFilter({ organizationId })
      ),
      queryClient.invalidateQueries(trpc.billing.getEntitlements.queryFilter({ organizationId })),
    ]);
  return {
    preferences: preferences.data,
    action,
    switching,
    organizationId,
    switchOrganization,
    refresh,
    refreshSubscription,
    publish: () => publish.mutate({ organizationId }),
  };
}
