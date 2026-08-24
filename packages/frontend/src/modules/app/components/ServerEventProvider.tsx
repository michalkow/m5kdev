import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useEffect, useRef } from "react";
import { useSession } from "../../auth/hooks/useSession";
import { useAppConfig } from "../hooks/useAppConfig";
import { type ServerEventHandler, subscribeToServerEvents } from "../server-event";

export const serverEventHandlerContext = createContext<
  ((input: { resource: string; handler: ServerEventHandler }) => () => void) | null
>(null);

export function ServerEventProvider({
  children,
  handlers,
  onReconnect,
}: {
  children: ReactNode;
  handlers?: Readonly<Record<string, ServerEventHandler>>;
  onReconnect?: (queryClient: QueryClient) => void;
}) {
  const queryClient = useQueryClient();
  const { serverUrl } = useAppConfig();
  const session = useSession();
  const userId = session.data?.user?.id;

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const mountedHandlers = useRef(new Map<string, Set<ServerEventHandler>>());

  const register = useCallback(
    (input: { resource: string; handler: ServerEventHandler }): (() => void) => {
      let set = mountedHandlers.current.get(input.resource);
      if (!set) {
        set = new Set();
        mountedHandlers.current.set(input.resource, set);
      }
      set.add(input.handler);
      return () => {
        const current = mountedHandlers.current.get(input.resource);
        current?.delete(input.handler);
        if (current && current.size === 0) {
          mountedHandlers.current.delete(input.resource);
        }
      };
    },
    []
  );

  useEffect(() => {
    if (!userId) return;
    const subscription = subscribeToServerEvents({
      serverUrl,
      queryClient,
      getActiveOrganizationId: () => sessionRef.current.data?.session.activeOrganizationId ?? null,
      getHandlers: (resource) => {
        const composed = handlersRef.current?.[resource];
        const mounted = mountedHandlers.current.get(resource);
        const list: ServerEventHandler[] = [];
        if (composed) list.push(composed);
        if (mounted) list.push(...mounted);
        return list;
      },
      onReconnect: (client) => {
        onReconnectRef.current?.(client);
      },
    });
    return () => {
      subscription.close();
    };
  }, [userId, serverUrl, queryClient]);

  return (
    <serverEventHandlerContext.Provider value={register}>
      {children}
    </serverEventHandlerContext.Provider>
  );
}
