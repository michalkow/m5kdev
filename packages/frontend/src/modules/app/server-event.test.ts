import { SERVER_EVENT_SUBSCRIBE_PATH } from "@m5kdev/commons/modules/base/server-event.schema";
import { QueryClient } from "@tanstack/react-query";
import {
  type ServerEventHandler,
  type ServerEventSource,
  type ServerEventSourceConstructor,
  subscribeToServerEvents,
} from "./server-event";

class FakeEventSource implements ServerEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly withCredentials: boolean;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials === true;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitData(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

function createSession(activeOrganizationId: string | null): {
  organizationId: string | null;
} {
  return { organizationId: activeOrganizationId };
}

describe("subscribeToServerEvents", () => {
  let queryClient: QueryClient;
  let session: { organizationId: string | null };
  let handlers: Record<string, ServerEventHandler[]>;

  beforeEach(() => {
    FakeEventSource.instances = [];
    queryClient = new QueryClient();
    session = createSession("org-a");
    handlers = {};
  });

  function subscribe(onReconnect?: (client: QueryClient) => void): { close(): void } {
    return subscribeToServerEvents({
      serverUrl: "http://server.test",
      queryClient,
      getActiveOrganizationId: () => session.organizationId,
      getHandlers: (resource) => handlers[resource] ?? [],
      onReconnect,
      EventSourceImpl: FakeEventSource as unknown as ServerEventSourceConstructor,
    });
  }

  it("opens one credentialed EventSource on the Shared subscribe path", () => {
    subscribe();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe(
      `http://server.test${SERVER_EVENT_SUBSCRIBE_PATH}`
    );
    expect(FakeEventSource.instances[0]?.withCredentials).toBe(true);
  });

  it("runs composition and mounted handlers for the resource", () => {
    const composition = jest.fn();
    const mounted = jest.fn();
    handlers.post = [composition, mounted];
    subscribe();

    FakeEventSource.instances[0]?.emitData({
      resource: "post",
      id: "post-1",
      change: "created",
      organizationId: "org-a",
    });

    expect(composition).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledWith(
      {
        resource: "post",
        id: "post-1",
        change: "created",
        organizationId: "org-a",
      },
      queryClient
    );
  });

  it("drops org-tagged events for a non-active Organization", () => {
    const handler = jest.fn();
    handlers.post = [handler];
    subscribe();

    FakeEventSource.instances[0]?.emitData({
      resource: "post",
      id: "post-other",
      change: "updated",
      organizationId: "org-b",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("always runs handlers for personal events and follows Organization switches", () => {
    const handler = jest.fn();
    handlers.file = [handler];
    subscribe();

    FakeEventSource.instances[0]?.emitData({
      resource: "file",
      id: "file-1",
      change: "updated",
      organizationId: null,
    });
    session.organizationId = "org-b";
    FakeEventSource.instances[0]?.emitData({
      resource: "file",
      id: "file-2",
      change: "created",
      organizationId: "org-b",
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("lets a handler inject a snapshot into QueryClient", () => {
    handlers.post = [
      (event, client) => {
        if (event.snapshot !== undefined) {
          client.setQueryData(["post", event.id], event.snapshot);
        }
      },
    ];
    subscribe();

    FakeEventSource.instances[0]?.emitData({
      resource: "post",
      id: "post-1",
      change: "created",
      organizationId: null,
      snapshot: { title: "Hello" },
    });

    expect(queryClient.getQueryData(["post", "post-1"])).toEqual({ title: "Hello" });
  });

  it("invokes onReconnect after a drop, not on the first open", () => {
    const onReconnect = jest.fn();
    subscribe(onReconnect);

    FakeEventSource.instances[0]?.emitOpen();
    expect(onReconnect).not.toHaveBeenCalled();

    FakeEventSource.instances[0]?.emitError();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledWith(queryClient);
  });

  it("does not invalidate QueryClient when onReconnect is omitted", () => {
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
    subscribe();

    FakeEventSource.instances[0]?.emitOpen();
    FakeEventSource.instances[0]?.emitError();

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
