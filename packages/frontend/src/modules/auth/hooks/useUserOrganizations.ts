import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useQuery } from "@tanstack/react-query";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useSession } from "./useSession";

export const useUserOrganizations = () => {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data, isLoading } = useSession();
  return useQuery(
    trpc.auth.listUserOrganizations.queryOptions(undefined, {
      enabled: !isLoading && Boolean(data?.session.userId),
    })
  );
};
