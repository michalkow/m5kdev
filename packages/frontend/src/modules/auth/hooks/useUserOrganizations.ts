import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";

export const useUserOrganizations = () => {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data, isLoading } = useSession();
  return useQuery(
    trpc.auth.listUserOrganizations.queryOptions(undefined, {
      enabled: !isLoading && Boolean(data?.session.userId),
    })
  );
};
