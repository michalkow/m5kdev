/**
 * @m5kdev/expo notifications module
 *
 * A unified abstraction for expo-notifications that:
 * - Prevents running in dev mode to avoid Expo Go errors (configurable)
 * - Supports multiple scheduling patterns (fixed times, intervals, frequencies)
 * - Provides type-safe API
 * - Handles Android notification channels
 * - Manages permissions gracefully
 *
 * @example
 * ```typescript
 * import {
 *   initializeNotifications,
 *   scheduleNotification,
 *   requestNotificationPermission
 * } from '@m5kdev/expo/notifications';
 *
 * // Initialize (typically in App.tsx or _layout.tsx)
 * initializeNotifications({
 *   enableInDev: false, // Don't run in dev mode (default)
 *   enabledPlatforms: ['android', 'ios'],
 *   androidChannel: {
 *     channelId: 'default',
 *     channelName: 'Default',
 *     importance: 'HIGH',
 *   },
 * });
 *
 * // Request permission
 * await requestNotificationPermission();
 *
 * // Schedule a notification
 * await scheduleNotification({
 *   type: 'fixed_times',
 *   times: ['09:00', '14:00', '21:00'],
 *   title: 'Reminder',
 *   body: 'Time for your check-in',
 * });
 * ```
 */

// Core
export {
  initializeNotifications,
  isNotificationsAvailable,
  getPlatform,
  shouldEnableNotifications,
  resetNotificationsModule,
} from './core';

// Types
export type {
  NotificationFrequency,
  NotificationScheduleType,
  FixedTimeConfig,
  IntervalConfig,
  FrequencyConfig,
  NotificationConfig,
  AndroidChannelConfig,
  NotificationPermissionStatus,
  NotificationHandlerConfig,
  NotificationInitOptions,
  ScheduleResult,
  NotificationsModule,
} from './types';

// Permissions
export {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  hasNotificationPermission,
  ensureNotificationPermission,
} from './permissions';

// Channel
export {
  setupAndroidChannel,
  deleteAndroidChannel,
  getAndroidChannels,
  DEFAULT_ANDROID_CHANNEL,
} from './channel';

// Scheduling
export {
  scheduleNotification,
  cancelNotification,
  cancelAllNotifications,
  getAllScheduledNotifications,
  getScheduledNotificationsCount,
} from './scheduling';

// Listeners
export {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  setNotificationHandler,
} from './listeners';

export type {
  NotificationReceivedListener,
  NotificationResponseReceivedListener,
  NotificationSubscription,
} from './listeners';
