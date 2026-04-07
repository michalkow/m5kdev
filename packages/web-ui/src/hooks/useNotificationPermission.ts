import { useCallback, useState } from "react";

function readNotificationPermission(): NotificationPermission {
  if (typeof Notification === "undefined") {
    return "denied";
  }
  return Notification.permission;
}

/**
 * Browser notification permission: current value, {@link Notification.requestPermission}, and refresh from the browser.
 */
export function useNotificationPermission(): {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  refresh: () => void;
} {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    readNotificationPermission()
  );

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof Notification === "undefined") {
      return "denied";
    }
    const next = await Notification.requestPermission();
    setPermission(next);
    return next;
  }, []);

  const refresh = useCallback(() => {
    setPermission(readNotificationPermission());
  }, []);

  return { permission, requestPermission, refresh };
}
