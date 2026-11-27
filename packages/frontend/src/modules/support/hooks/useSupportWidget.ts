import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useServerEventHandler } from "../../app/hooks/useServerEventHandler";
export function useSupportWidget(options?: { isOpen: boolean; onClose: () => void }) {
  const isOpen = options?.isOpen;
  const onClose = options?.onClose;
  useEffect(() => {
    if (!isOpen || !onClose) return;
    // Pending controls can release focus to the page. Escape still closes the
    // open widget; a nested control may consume it first with preventDefault.
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [isOpen, onClose]);
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
