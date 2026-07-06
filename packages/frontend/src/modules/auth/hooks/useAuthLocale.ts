import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { syncI18nLocale } from "../../app/utils/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAuthLocale() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();

  const localeQuery = useQuery(trpc.auth.getLocale.queryOptions());
  const setLocaleMutation = useMutation(
    trpc.auth.setLocale.mutationOptions({
      onSuccess: async (locale) => {
        await syncI18nLocale(locale);
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
