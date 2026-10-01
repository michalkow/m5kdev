import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { syncAuthenticatedLocale } from "../../app/utils/locale";
import { useSession } from "./useSession";

export function useAuthLocale() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const { registerSession } = useSession();

  const localeQuery = useQuery(trpc.auth.getLocale.queryOptions());
  const setLocaleMutation = useMutation(
    trpc.auth.setLocale.mutationOptions({
      onSuccess: async (locale) => {
        await syncAuthenticatedLocale(locale, () =>
          registerSession(undefined, { disableCookieCache: true })
        );
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.getLocale.queryKey(),
        });
      },
    })
  );

  return {
    locale: localeQuery.data,
    isLoading: localeQuery.isLoading,
    setLocale: setLocaleMutation.mutate,
    isSettingLocale: setLocaleMutation.isPending,
  };
}
