import { Platform } from 'react-native';
import type { NotificationInitOptions } from './types';

/**
 * Type for the dynamically imported expo-notifications module
 */
type ExpoNotificationsModule = typeof import('expo-notifications');

/**
 * Cached reference to the expo-notifications module
 */
let notificationsModule: ExpoNotificationsModule | null = null;

/**
 * Configuration options
 */
let options: NotificationInitOptions = {
  enableInDev: false,
  enabledPlatforms: ['ios', 'android'],
};

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return __DEV__;
}

/**
 * Get the current platform
 */
export function getPlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

/**
 * Check if notifications should be enabled based on configuration
 */
export function shouldEnableNotifications(): boolean {
  const { enableInDev = false, enabledPlatforms = ['ios', 'android'] } = options;

  // Check if we're in dev mode and dev mode is disabled
  if (isDevelopment() && !enableInDev) {
    return false;
  }

  // Check if current platform is enabled
  const currentPlatform = getPlatform();
  if (!enabledPlatforms.includes(currentPlatform as 'ios' | 'android' | 'web')) {
    return false;
  }

  return true;
}

/**
 * Initialize the notifications module with options
 */
export function initializeNotifications(initOptions: NotificationInitOptions = {}): void {
  options = { ...options, ...initOptions };
}

/**
 * Get the expo-notifications module, loading it if necessary and allowed
 */
export async function getNotificationsModule(): Promise<ExpoNotificationsModule | null> {
  if (!shouldEnableNotifications()) {
    return null;
  }

  if (notificationsModule) {
    return notificationsModule;
  }

  try {
    // Dynamically import expo-notifications to prevent Expo Go errors in dev
    notificationsModule = await import('expo-notifications');

    // Set default notification handler if configured
    if (options.handler) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => options.handler!.handleNotification,
      });
    }

    // Setup Android channel if configured
    if (options.androidChannel && getPlatform() === 'android') {
      const { setupAndroidChannelInternal } = await import('./channel');
      await setupAndroidChannelInternal(notificationsModule, options.androidChannel);
    }

    return notificationsModule;
  } catch (error) {
    console.warn('Failed to load expo-notifications:', error);
    return null;
  }
}

/**
 * Check if notifications are available
 */
export function isNotificationsAvailable(): boolean {
  return shouldEnableNotifications();
}

/**
 * Reset the module (useful for testing)
 */
export function resetNotificationsModule(): void {
  notificationsModule = null;
}
