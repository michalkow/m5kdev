import { QueryClient } from "@tanstack/react-query";
import {
  handleNotificationInboxServerEvent,
  notificationInboxQueryKey,
  notificationPreferencesQueryKey,
  shouldInvalidateNotificationInbox,
} from "./notification.query";

describe("notification query keys", () => {
  it("scopes inbox and preferences to the active Organization", () => {
    expect(notificationInboxQueryKey("org-a")).toEqual(["notification", "inbox", "org-a"]);
    expect(notificationInboxQueryKey("org-b")).toEqual(["notification", "inbox", "org-b"]);
    expect(notificationInboxQueryKey("org-a")).not.toEqual(notificationInboxQueryKey("org-b"));
    expect(notificationPreferencesQueryKey("org-a")).not.toEqual(
      notificationPreferencesQueryKey("org-b")
    );
  });

  it("keeps Organization A inbox rows when switching to Organization B", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationInboxQueryKey("org-a"), [{ title: "Org A" }]);
    queryClient.setQueryData(notificationInboxQueryKey("org-b"), [{ title: "Org B" }]);

    expect(queryClient.getQueryData(notificationInboxQueryKey("org-a"))).toEqual([
      { title: "Org A" },
    ]);
    expect(queryClient.getQueryData(notificationInboxQueryKey("org-b"))).toEqual([
      { title: "Org B" },
    ]);
  });
});

describe("handleNotificationInboxServerEvent", () => {
  it("invalidates inbox for a matching organizationId and ignores a foreign one", () => {
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

  it("does not invalidate when there is no active Organization", () => {
    const queryClient = new QueryClient();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    handleNotificationInboxServerEvent({
      queryClient,
      activeOrganizationId: null,
      event: {
        resource: "notification",
        id: "n-1",
        change: "created",
        organizationId: "org-a",
      },
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(
      shouldInvalidateNotificationInbox({
        activeOrganizationId: null,
        event: {
          resource: "notification",
          id: "n-1",
          change: "created",
          organizationId: "org-a",
        },
      })
    ).toBe(false);
  });
});
