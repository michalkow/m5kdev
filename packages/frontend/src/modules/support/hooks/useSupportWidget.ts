import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useServerEventHandler } from "../../app/hooks/useServerEventHandler";
export function useSupportWidget() {
  const trpc = useAppTRPC<SupportAppRouter>();
  const cache = useQueryClient();
  const unread = useQuery(trpc.support.getUnreadCount.queryOptions({}, { refetchInterval: 10000 }));
  useServerEventHandler({
    resource: "support.case",
    handler: () => {
      void cache.invalidateQueries(trpc.support.getUnreadCount.queryFilter());
    },
  });
  return { unreadCount: unread.data?.count ?? 0 };
}
