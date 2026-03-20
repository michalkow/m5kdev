import { getPlatform, getNotificationsModule } from './core';
import type { AndroidChannelConfig } from './types';

/**
 * Default Android channel configuration
 */
export const DEFAULT_ANDROID_CHANNEL: AndroidChannelConfig = {
  channelId: 'default',
  channelName: 'Default Notifications',
  importance: 'HIGH',
  sound: 'default',
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#2563eb',
  enableVibrate: true,
  enableLights: true,
  showBadge: true,
};

/**
 * Map importance string to expo-notifications constant
 */
function getImportanceValue(
  notifications: NonNullable<Awaited<ReturnType<typeof getNotificationsModule>>>,
  importance: AndroidChannelConfig['importance']
): number {
  const importanceMap = {
    MIN: notifications.AndroidImportance.MIN,
    LOW: notifications.AndroidImportance.LOW,
    DEFAULT: notifications.AndroidImportance.DEFAULT,
    HIGH: notifications.AndroidImportance.HIGH,
    MAX: notifications.AndroidImportance.MAX,
  };

  return importanceMap[importance];
}

/**
 * Internal function to setup Android channel (used by core module during initialization)
 */
export async function setupAndroidChannelInternal(
  notifications: NonNullable<Awaited<ReturnType<typeof getNotificationsModule>>>,
  config: AndroidChannelConfig
): Promise<boolean> {
  if (getPlatform() !== 'android') {
    return false;
  }

  try {
    await notifications.setNotificationChannelAsync(config.channelId, {
      name: config.channelName,
      importance: getImportanceValue(notifications, config.importance),
      sound: config.sound === null ? null : config.sound || 'default',
      vibrationPattern: config.vibrationPattern || [0, 250, 250, 250],
      lightColor: config.lightColor || '#2563eb',
      enableVibrate: config.enableVibrate ?? true,
      enableLights: config.enableLights ?? true,
      showBadge: config.showBadge ?? true,
    });

    return true;
  } catch (error) {
    console.error('Error setting up Android notification channel:', error);
    return false;
  }
}

/**
 * Setup Android notification channel
 */
export async function setupAndroidChannel(
  config: AndroidChannelConfig = DEFAULT_ANDROID_CHANNEL
): Promise<boolean> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return false;
  }

  return setupAndroidChannelInternal(notifications, config);
}

/**
 * Delete an Android notification channel
 */
export async function deleteAndroidChannel(channelId: string): Promise<boolean> {
  const notifications = await getNotificationsModule();

  if (!notifications || getPlatform() !== 'android') {
    return false;
  }

  try {
    await notifications.deleteNotificationChannelAsync(channelId);
    return true;
  } catch (error) {
    console.error('Error deleting Android notification channel:', error);
    return false;
  }
}

/**
 * Get all Android notification channels
 */
export async function getAndroidChannels(): Promise<unknown[] | null> {
  const notifications = await getNotificationsModule();

  if (!notifications || getPlatform() !== 'android') {
    return null;
  }

  try {
    return await notifications.getNotificationChannelsAsync();
  } catch (error) {
    console.error('Error getting Android notification channels:', error);
    return null;
  }
}
