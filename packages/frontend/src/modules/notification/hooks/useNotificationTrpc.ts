import type {
  notificationInstanceSelectSchema,
  notificationListInboxOutputSchema,
  notificationListPreferencesOutputSchema,
  notificationSetPreferenceInputSchema,
} from "@m5kdev/commons/modules/notification/notification.schema";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";

export type NotificationInboxItem = z.infer<typeof notificationInstanceSelectSchema>;
export type NotificationInbox = z.infer<typeof notificationListInboxOutputSchema>;
export type NotificationPreferences = z.infer<typeof notificationListPreferencesOutputSchema>;
export type NotificationSetPreferenceInput = z.infer<typeof notificationSetPreferenceInputSchema>;

export interface NotificationTrpc {
  listMyInbox: {
    queryOptions: (
      input?: undefined,
      opts?: { enabled?: boolean }
    ) => UseQueryOptions<NotificationInbox>;
  };
  markRead: {
    mutationOptions: (
      opts?: UseMutationOptions<NotificationInboxItem, Error, { id: string }>
    ) => UseMutationOptions<NotificationInboxItem, Error, { id: string }>;
  };
  getMyPreferences: {
    queryOptions: (
      input?: undefined,
      opts?: { enabled?: boolean }
    ) => UseQueryOptions<NotificationPreferences>;
  };
  setMyPreference: {
    mutationOptions: (
      opts?: UseMutationOptions<
        NotificationPreferences[number],
        Error,
        NotificationSetPreferenceInput
      >
    ) => UseMutationOptions<NotificationPreferences[number], Error, NotificationSetPreferenceInput>;
  };
}

export function useNotificationTrpc(): NotificationTrpc {
  const trpc = useAppTRPC();
  return (trpc as unknown as { notification: NotificationTrpc }).notification;
}
