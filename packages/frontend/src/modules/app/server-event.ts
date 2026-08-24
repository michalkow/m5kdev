import {
  SERVER_EVENT_SUBSCRIBE_PATH,
  type ServerEventEnvelope,
  serverEventEnvelopeSchema,
} from "@m5kdev/commons/modules/base/server-event.schema";
import type { QueryClient } from "@tanstack/react-query";

export type ServerEventHandler = (event: ServerEventEnvelope, queryClient: QueryClient) => void;

export interface ServerEventSource {
  close(): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
}

export type ServerEventSourceConstructor = new (
  url: string,
  init?: EventSourceInit
) => ServerEventSource;

export interface SubscribeToServerEventsInput {
  readonly serverUrl: string;
  readonly queryClient: QueryClient;
  readonly getActiveOrganizationId: () => string | null | undefined;
  readonly getHandlers: (resource: string) => readonly ServerEventHandler[];
  readonly onReconnect?: (queryClient: QueryClient) => void;
  readonly EventSourceImpl?: ServerEventSourceConstructor;
}

function subscribeUrl(serverUrl: string): string {
  return `${serverUrl.replace(/\/$/, "")}${SERVER_EVENT_SUBSCRIBE_PATH}`;
}

function shouldDeliverServerEvent(
  organizationId: string | null,
  activeOrganizationId: string | null | undefined
): boolean {
  if (organizationId === null) return true;
  return organizationId === (activeOrganizationId ?? null);
}

export function subscribeToServerEvents(input: SubscribeToServerEventsInput): {
  close(): void;
} {
  const EventSourceImpl = input.EventSourceImpl ?? globalThis.EventSource;
  if (!EventSourceImpl) {
    return { close() {} };
  }

  const source = new EventSourceImpl(subscribeUrl(input.serverUrl), {
    withCredentials: true,
  });
  let opened = false;

  source.onopen = () => {
    opened = true;
  };
  source.onerror = () => {
    if (!opened) return;
    opened = false;
    input.onReconnect?.(input.queryClient);
  };
  source.onmessage = (event) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(event.data)) as unknown;
    } catch {
      return;
    }
    const parsed = serverEventEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return;
    const envelope = parsed.data;
    if (!shouldDeliverServerEvent(envelope.organizationId, input.getActiveOrganizationId())) {
      return;
    }
    for (const handler of input.getHandlers(envelope.resource)) {
      try {
        handler(envelope, input.queryClient);
      } catch {
        // A handler must not stop remaining handlers or close the stream.
      }
    }
  };

  return {
    close() {
      source.close();
    },
  };
}
