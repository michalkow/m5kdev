import { getNotificationsModule } from './core';

/**
 * Type for notification received listener
 */
export type NotificationReceivedListener = (notification: unknown) => void;

/**
 * Type for notification response received listener
 */
export type NotificationResponseReceivedListener = (response: unknown) => void;

/**
 * Type for listener subscription
 */
export interface NotificationSubscription {
  remove: () => void;
}

/**
 * Add a listener for when notifications are received while the app is foregrounded
 */
export function addNotificationReceivedListener(
  listener: NotificationReceivedListener
): NotificationSubscription | null {
  getNotificationsModule().then((notifications) => {
    if (!notifications) {
      return null;
    }

    try {
      return notifications.addNotificationReceivedListener(listener);
    } catch (error) {
      console.error('Error adding notification received listener:', error);
      return null;
    }
  });

  // Return a dummy subscription if notifications aren't available
  return {
    remove: () => {},
  };
}

/**
 * Add a listener for when a user taps on or interacts with a notification
 */
export function addNotificationResponseReceivedListener(
  listener: NotificationResponseReceivedListener
): NotificationSubscription | null {
  getNotificationsModule().then((notifications) => {
    if (!notifications) {
      return null;
    }

    try {
      return notifications.addNotificationResponseReceivedListener(listener);
    } catch (error) {
      console.error('Error adding notification response listener:', error);
      return null;
    }
  });

  // Return a dummy subscription if notifications aren't available
  return {
    remove: () => {},
  };
}

/**
 * Get the notification that launched the app (if any)
 */
export async function getLastNotificationResponseAsync(): Promise<unknown | null> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return null;
  }

  try {
    return await notifications.getLastNotificationResponseAsync();
  } catch (error) {
    console.error('Error getting last notification response:', error);
    return null;
  }
}

/**
 * Set the notification handler
 */
export async function setNotificationHandler(handler: {
  handleNotification: () => Promise<{
    shouldShowAlert: boolean;
    shouldPlaySound: boolean;
    shouldSetBadge: boolean;
  }>;
}): Promise<boolean> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return false;
  }

  try {
    notifications.setNotificationHandler(handler);
    return true;
  } catch (error) {
    console.error('Error setting notification handler:', error);
    return false;
  }
}
