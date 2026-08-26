import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../auth/hooks/useSession";
import { notificationPreferencesQueryKey } from "../notification.query";
import {
  type NotificationPreferences,
  type NotificationSetPreferenceInput,
  useNotificationTrpc,
} from "./useNotificationTrpc";

export function useNotificationPreferences(): {
  preferences: NotificationPreferences;
  isLoading: boolean;
  setPreference: (input: NotificationSetPreferenceInput) => void;
  isSaving: boolean;
} {
  const notification = useNotificationTrpc();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId ?? null;

  const listOptions = notification.getMyPreferences.queryOptions(undefined, {
    enabled: Boolean(organizationId),
  });
  const prefsQuery = useQuery({
    ...listOptions,
    queryKey: notificationPreferencesQueryKey(organizationId),
    enabled: Boolean(organizationId),
  });

  const setPreferenceMutation = useMutation(
    notification.setMyPreference.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: notificationPreferencesQueryKey(organizationId),
        });
      },
    })
  );

  return {
    preferences: prefsQuery.data ?? [],
    isLoading: prefsQuery.isLoading,
    setPreference: (input: NotificationSetPreferenceInput) => {
      setPreferenceMutation.mutate(input);
    },
    isSaving: setPreferenceMutation.isPending,
  };
}
