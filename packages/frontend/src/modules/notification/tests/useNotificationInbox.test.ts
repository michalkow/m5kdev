import { QueryClient } from "@tanstack/react-query";
import {
  createNotificationInboxQuery,
  handleNotificationInboxServerEvent,
  invalidateNotificationInbox,
  notificationInboxQueryKey,
} from "../notification.query";
import type {
  NotificationInbox,
  NotificationInboxItem,
  NotificationTrpc,
} from "./useNotificationTrpc";

async function runQueryFn<T>(queryFn: unknown): Promise<T> {
  if (typeof queryFn !== "function") {
    throw new Error("expected queryFn");
  }
  return queryFn() as Promise<T>;
}

function inboxItem(
  overrides: Pick<NotificationInboxItem, "id" | "title"> & Partial<NotificationInboxItem>
): NotificationInboxItem {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    memberId: "member-1",
    userId: "user-1",
    kind: "demo.ping",
    body: overrides.title,
    data: null,
    visibleInInbox: true,
    webPushedAt: null,
    mobilePushedAt: null,
    emailedAt: null,
    readAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createStubNotificationTrpc(state: {
  activeOrganizationId: string;
  inbox: Record<string, NotificationInbox>;
}): NotificationTrpc {
  return {
    listMyInbox: {
      queryOptions: () => ({
        queryKey: ["notification", "inbox", "stub"] as const,
        queryFn: async () => state.inbox[state.activeOrganizationId] ?? [],
      }),
    },
    markRead: {
      mutationOptions: (opts) => ({
        ...opts,
        mutationFn: async (input: { id: string }) => {
          const rows = state.inbox[state.activeOrganizationId] ?? [];
          const item = rows.find((row) => row.id === input.id);
          if (!item) throw new Error("missing inbox row");
          const next = { ...item, readAt: new Date("2026-01-01T00:01:00.000Z") };
          state.inbox[state.activeOrganizationId] = rows.map((row) =>
            row.id === input.id ? next : row
          );
          return next;
        },
      }),
    },
    getMyPreferences: {
      queryOptions: () => ({
        queryKey: ["notification", "preferences", "stub"] as const,
        queryFn: async () => [],
      }),
    },
    setMyPreference: {
      mutationOptions: (opts) => opts ?? {},
    },
  };
}

describe("useNotificationInbox", () => {
  it("lists and mark-read only the active Organization inbox through stub tRPC", async () => {
    const state = {
      activeOrganizationId: "org-a",
      inbox: {
        "org-a": [inboxItem({ id: "n-a", title: "Org A" })],
        "org-b": [inboxItem({ id: "n-b", title: "Org B" })],
      },
    };
    const notification = createStubNotificationTrpc(state);
    const queryClient = new QueryClient();

    const listA = createNotificationInboxQuery({
      organizationId: "org-a",
      listOptions: notification.listMyInbox.queryOptions(undefined, { enabled: true }),
    });
    expect(listA.queryKey).toEqual(notificationInboxQueryKey("org-a"));
    expect(await runQueryFn(notification.listMyInbox.queryOptions().queryFn)).toEqual([
      inboxItem({ id: "n-a", title: "Org A" }),
    ]);

    const marked = await notification.markRead
      .mutationOptions({
        onSuccess: () => {
          invalidateNotificationInbox(queryClient, "org-a");
        },
      })
      .mutationFn?.({ id: "n-a" });
    expect(marked?.readAt).toEqual(new Date("2026-01-01T00:01:00.000Z"));
    expect(state.inbox["org-a"]?.[0]?.readAt).toEqual(new Date("2026-01-01T00:01:00.000Z"));

    state.activeOrganizationId = "org-b";
    const listB = createNotificationInboxQuery({
      organizationId: "org-b",
      listOptions: notification.listMyInbox.queryOptions(undefined, { enabled: true }),
    });
    expect(listB.queryKey).not.toEqual(listA.queryKey);
    expect(await runQueryFn(notification.listMyInbox.queryOptions().queryFn)).toEqual([
      inboxItem({ id: "n-b", title: "Org B" }),
    ]);
  });

  it("refetches inbox for a matching organizationId Server event and ignores a foreign one", () => {
    const queryClient = new QueryClient();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    handleNotificationInboxServerEvent({
      queryClient,
      activeOrganizationId: "org-a",
      event: {
        resource: "notification",
        id: "n-1",
        change: "created",
        organizationId: "org-a",
      },
    });
    handleNotificationInboxServerEvent({
      queryClient,
      activeOrganizationId: "org-a",
      event: {
        resource: "notification",
        id: "n-2",
        change: "created",
        organizationId: "org-b",
      },
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: notificationInboxQueryKey("org-a"),
    });
  });
});
