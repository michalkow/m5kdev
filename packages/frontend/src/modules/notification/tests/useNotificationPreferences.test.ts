import { QueryClient } from "@tanstack/react-query";
import {
  createNotificationPreferencesQuery,
  invalidateNotificationPreferences,
  notificationPreferencesQueryKey,
} from "../notification.query";
import type {
  NotificationPreferences,
  NotificationSetPreferenceInput,
  NotificationTrpc,
} from "../hooks/useNotificationTrpc";

async function runQueryFn<T>(queryFn: unknown): Promise<T> {
  if (typeof queryFn !== "function") {
    throw new Error("expected queryFn");
  }
  return queryFn() as Promise<T>;
}

function createStubNotificationTrpc(state: {
  activeOrganizationId: string;
  prefs: Record<string, NotificationPreferences>;
}): NotificationTrpc {
  return {
    listMyInbox: {
      queryOptions: () => ({
        queryKey: ["notification", "inbox", "stub"] as const,
        queryFn: async () => [],
      }),
    },
    markRead: {
      mutationOptions: (opts) => opts ?? {},
    },
    getMyPreferences: {
      queryOptions: () => ({
        queryKey: ["notification", "preferences", "stub"] as const,
        queryFn: async () => state.prefs[state.activeOrganizationId] ?? [],
      }),
    },
    setMyPreference: {
      mutationOptions: (opts) => ({
        ...opts,
        mutationFn: async (input: NotificationSetPreferenceInput) => {
          const current = state.prefs[state.activeOrganizationId] ?? [];
          const existing = current.find((row) => row.kind === input.kind);
          const nextKind = existing
            ? {
                kind: input.kind,
                channels: existing.channels.map((channel) =>
                  channel.channel === input.channel
                    ? { channel: input.channel, enabled: input.enabled }
                    : channel
                ),
              }
            : {
                kind: input.kind,
                channels: [{ channel: input.channel, enabled: input.enabled }],
              };
          const next = existing
            ? current.map((row) => (row.kind === input.kind ? nextKind : row))
            : [...current, nextKind];
          state.prefs[state.activeOrganizationId] = next;
          return nextKind;
        },
      }),
    },
  };
}

describe("useNotificationPreferences", () => {
  it("gets and sets preferences for the active Organization through stub tRPC", async () => {
    const state = {
      activeOrganizationId: "org-a",
      prefs: {
        "org-a": [
          {
            kind: "demo.ping",
            channels: [{ channel: "in-app" as const, enabled: true }],
          },
        ],
        "org-b": [
          {
            kind: "demo.ping",
            channels: [{ channel: "in-app" as const, enabled: true }],
          },
        ],
      },
    };
    const notification = createStubNotificationTrpc(state);
    const queryClient = new QueryClient();

    const listA = createNotificationPreferencesQuery({
      organizationId: "org-a",
      listOptions: notification.getMyPreferences.queryOptions(undefined, { enabled: true }),
    });
    expect(listA.queryKey).toEqual(notificationPreferencesQueryKey("org-a"));
    expect(await runQueryFn(notification.getMyPreferences.queryOptions().queryFn)).toEqual(
      state.prefs["org-a"]
    );

    const saved = await notification.setMyPreference
      .mutationOptions({
        onSuccess: () => {
          invalidateNotificationPreferences(queryClient, "org-a");
        },
      })
      .mutationFn?.({ kind: "demo.ping", channel: "in-app", enabled: false });
    expect(saved).toEqual({
      kind: "demo.ping",
      channels: [{ channel: "in-app", enabled: false }],
    });
    expect(await runQueryFn(notification.getMyPreferences.queryOptions().queryFn)).toEqual([
      {
        kind: "demo.ping",
        channels: [{ channel: "in-app", enabled: false }],
      },
    ]);

    state.activeOrganizationId = "org-b";
    const listB = createNotificationPreferencesQuery({
      organizationId: "org-b",
      listOptions: notification.getMyPreferences.queryOptions(undefined, { enabled: true }),
    });
    expect(listB.queryKey).not.toEqual(listA.queryKey);
    expect(await runQueryFn(notification.getMyPreferences.queryOptions().queryFn)).toEqual([
      {
        kind: "demo.ping",
        channels: [{ channel: "in-app", enabled: true }],
      },
    ]);
  });
});
