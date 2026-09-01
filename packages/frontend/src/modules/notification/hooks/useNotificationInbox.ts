import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerEventHandler } from "../../app/hooks/useServerEventHandler";
import { useSession } from "../../auth/hooks/useSession";
import {
  createNotificationInboxQuery,
  handleNotificationInboxServerEvent,
  invalidateNotificationInbox,
} from "../notification.query";
import { type NotificationInbox, useNotificationTrpc } from "./useNotificationTrpc";

export function useNotificationInbox(): {
  notifications: NotificationInbox;
  isLoading: boolean;
  markRead: (id: string) => void;
  isMarkingRead: boolean;
} {
  const notification = useNotificationTrpc();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId ?? null;

  useServerEventHandler({
    resource: "notification",
    handler: (event, client) => {
      handleNotificationInboxServerEvent({
        event,
        activeOrganizationId: organizationId,
        queryClient: client,
      });
    },
  });

  const listOptions = notification.listMyInbox.queryOptions(undefined, {
    enabled: Boolean(organizationId),
  });
  const inboxQuery = useQuery(
    createNotificationInboxQuery({
      organizationId,
      listOptions,
    })
  );

  const markReadMutation = useMutation(
    notification.markRead.mutationOptions({
      onSuccess: () => {
        invalidateNotificationInbox(queryClient, organizationId);
      },
    })
  );

  return {
    notifications: inboxQuery.data ?? [],
    isLoading: inboxQuery.isLoading,
    markRead: (id: string) => {
      markReadMutation.mutate({ id });
    },
    isMarkingRead: markReadMutation.isPending,
  };
}
