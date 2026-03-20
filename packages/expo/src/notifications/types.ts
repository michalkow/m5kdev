/**
 * Notification frequency options
 */
export type NotificationFrequency =
  | 'none'
  | 'daily'
  | 'every_2_days'
  | 'every_3_days'
  | 'weekly'
  | 'every_2_weeks'
  | 'monthly'
  | 'quarterly'
  | 'semi_annually'
  | 'annually';

/**
 * Notification schedule type
 */
export type NotificationScheduleType =
  | 'fixed_times'  // Fixed times each day (e.g., 9:00 AM, 2:00 PM)
  | 'interval';    // Every X hours

/**
 * Configuration for fixed time notifications
 */
export interface FixedTimeConfig {
  type: 'fixed_times';
  times: string[]; // Array of time strings in "HH:mm" format
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Configuration for interval-based notifications
 */
export interface IntervalConfig {
  type: 'interval';
  intervalHours: number;
  nextTriggerAt?: Date; // Optional specific time for next trigger
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Configuration for frequency-based notifications
 */
export interface FrequencyConfig {
  type: 'frequency';
  frequency: NotificationFrequency;
  time: string; // Time in "HH:mm" format
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Union type for all notification configurations
 */
export type NotificationConfig = FixedTimeConfig | IntervalConfig | FrequencyConfig;

/**
 * Android notification channel configuration
 */
export interface AndroidChannelConfig {
  channelId: string;
  channelName: string;
  importance: 'MIN' | 'LOW' | 'DEFAULT' | 'HIGH' | 'MAX';
  sound?: string | null;
  vibrationPattern?: number[];
  lightColor?: string;
  enableVibrate?: boolean;
  enableLights?: boolean;
  showBadge?: boolean;
}

/**
 * Notification permission status
 */
export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined';

/**
 * Notification handler configuration
 */
export interface NotificationHandlerConfig {
  handleNotification: {
    shouldShowAlert: boolean;
    shouldPlaySound: boolean;
    shouldSetBadge: boolean;
  };
}

/**
 * Options for initializing notifications
 */
export interface NotificationInitOptions {
  /**
   * Whether to run notifications in development mode
   * @default false
   */
  enableInDev?: boolean;

  /**
   * Platforms to enable notifications on
   * @default ['ios', 'android']
   */
  enabledPlatforms?: Array<'ios' | 'android' | 'web'>;

  /**
   * Android channel configuration
   */
  androidChannel?: AndroidChannelConfig;

  /**
   * Notification handler configuration
   */
  handler?: NotificationHandlerConfig;
}

/**
 * Result of scheduling a notification
 */
export interface ScheduleResult {
  success: boolean;
  notificationIds: string[];
  error?: string;
}

/**
 * Notification module interface
 */
export interface NotificationsModule {
  // Permission methods
  requestPermission: () => Promise<NotificationPermissionStatus>;
  getPermissionStatus: () => Promise<NotificationPermissionStatus>;

  // Scheduling methods
  scheduleNotification: (config: NotificationConfig) => Promise<ScheduleResult>;
  cancelNotification: (notificationId: string) => Promise<boolean>;
  cancelAllNotifications: () => Promise<boolean>;

  // Listener methods
  addNotificationReceivedListener: (listener: (notification: unknown) => void) => { remove: () => void } | null;
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => { remove: () => void } | null;

  // Channel methods (Android only)
  setupAndroidChannel: (config: AndroidChannelConfig) => Promise<boolean>;

  // Utility methods
  isAvailable: () => boolean;
  getPlatform: () => 'ios' | 'android' | 'web' | 'unknown';
}
