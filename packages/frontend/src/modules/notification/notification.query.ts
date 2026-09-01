import type { ServerEventEnvelope } from "@m5kdev/commons/modules/base/server-event.schema";
import type { QueryClient } from "@tanstack/react-query";

export const NOTIFICATION_INBOX_QUERY_KEY = ["notification", "inbox"] as const;
export const NOTIFICATION_PREFERENCES_QUERY_KEY = ["notification", "preferences"] as const;

export function notificationInboxQueryKey(
  organizationId: string | null | undefined
): readonly [string, string, string] {
  return [...NOTIFICATION_INBOX_QUERY_KEY, organizationId ?? "none"];
}

export function notificationPreferencesQueryKey(
  organizationId: string | null | undefined
): readonly [string, string, string] {
  return [...NOTIFICATION_PREFERENCES_QUERY_KEY, organizationId ?? "none"];
}

export function shouldInvalidateNotificationInbox(input: {
  event: ServerEventEnvelope;
  activeOrganizationId: string | null | undefined;
}): boolean {
  if (input.event.resource !== "notification") return false;
  if (!input.activeOrganizationId) return false;
  return input.event.organizationId === input.activeOrganizationId;
}

export function invalidateNotificationInbox(
  queryClient: QueryClient,
  organizationId: string | null | undefined
): void {
  void queryClient.invalidateQueries({ queryKey: notificationInboxQueryKey(organizationId) });
}

export function invalidateNotificationPreferences(
  queryClient: QueryClient,
  organizationId: string | null | undefined
): void {
  void queryClient.invalidateQueries({
    queryKey: notificationPreferencesQueryKey(organizationId),
  });
}

export function createNotificationInboxQuery<TQuery extends object>(input: {
  organizationId: string | null | undefined;
  listOptions: TQuery;
}): TQuery & { queryKey: readonly [string, string, string]; enabled: boolean } {
  return {
    ...input.listOptions,
    queryKey: notificationInboxQueryKey(input.organizationId),
    enabled: Boolean(input.organizationId),
  };
}

export function createNotificationPreferencesQuery<TQuery extends object>(input: {
  organizationId: string | null | undefined;
  listOptions: TQuery;
}): TQuery & { queryKey: readonly [string, string, string]; enabled: boolean } {
  return {
    ...input.listOptions,
    queryKey: notificationPreferencesQueryKey(input.organizationId),
    enabled: Boolean(input.organizationId),
  };
}

export function handleNotificationInboxServerEvent(input: {
  event: ServerEventEnvelope;
  activeOrganizationId: string | null | undefined;
  queryClient: QueryClient;
}): void {
  if (!shouldInvalidateNotificationInbox(input)) return;
  invalidateNotificationInbox(input.queryClient, input.activeOrganizationId);
}
