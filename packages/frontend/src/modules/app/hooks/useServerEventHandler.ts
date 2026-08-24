import { useContext, useEffect, useRef } from "react";
import { serverEventHandlerContext } from "../components/ServerEventProvider";
import type { ServerEventHandler } from "../server-event";

export function useServerEventHandler(input: {
  resource: string;
  handler: ServerEventHandler;
}): void {
  const register = useContext(serverEventHandlerContext);
  const handlerRef = useRef(input.handler);
  handlerRef.current = input.handler;

  useEffect(() => {
    if (!register) return;
    const wrapped: ServerEventHandler = (event, queryClient) => {
      handlerRef.current(event, queryClient);
    };
    return register({ resource: input.resource, handler: wrapped });
  }, [input.resource, register]);
}
