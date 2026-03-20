import { getNotificationsModule } from './core';
import type { NotificationPermissionStatus } from './types';

/**
 * Request notification permissions from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return 'denied';
  }

  try {
    const { status } = await notifications.requestPermissionsAsync();

    if (status === 'granted') {
      return 'granted';
    }

    if (status === 'denied') {
      return 'denied';
    }

    return 'undetermined';
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return 'denied';
  }
}

/**
 * Get current notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return 'denied';
  }

  try {
    const { status } = await notifications.getPermissionsAsync();

    if (status === 'granted') {
      return 'granted';
    }

    if (status === 'denied') {
      return 'denied';
    }

    return 'undetermined';
  } catch (error) {
    console.error('Error getting notification permission status:', error);
    return 'denied';
  }
}

/**
 * Check if notification permissions are granted
 */
export async function hasNotificationPermission(): Promise<boolean> {
  const status = await getNotificationPermissionStatus();
  return status === 'granted';
}

/**
 * Request permissions if not already granted
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const currentStatus = await getNotificationPermissionStatus();

  if (currentStatus === 'granted') {
    return true;
  }

  if (currentStatus === 'denied') {
    return false;
  }

  const newStatus = await requestNotificationPermission();
  return newStatus === 'granted';
}
