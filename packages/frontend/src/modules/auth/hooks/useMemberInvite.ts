import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { type UseOrganizationAccessProps, useOrganizationAccess } from "./useOrganizationAccess";

interface UseAuthMemberInviteOptions {
  onSuccess?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export function useAuthMemberInvite(
  options: UseAuthMemberInviteOptions,
  props?: UseOrganizationAccessProps
) {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const { refreshOrganizationQueries } = useOrganizationAccess(props ?? {});
  return useMutation(
    trpc.auth.inviteOrganizationMember.mutationOptions({
      onSuccess: async () => {
        await refreshOrganizationQueries();
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.listOrganizationMembers.queryKey(),
        });
        await options.onSuccess?.();
      },
      onError: options.onError,
    })
  );
}
