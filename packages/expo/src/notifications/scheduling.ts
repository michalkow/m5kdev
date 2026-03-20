import { getNotificationsModule } from './core';
import type {
  NotificationConfig,
  ScheduleResult,
  FixedTimeConfig,
  IntervalConfig,
  FrequencyConfig,
  NotificationFrequency,
} from './types';

/**
 * Parse a time string in "HH:mm" format to hours and minutes
 */
function parseTime(timeString: string): { hour: number; minute: number } | null {
  const match = timeString.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

/**
 * Get the next occurrence of a specific time
 */
function getNextOccurrence(hour: number, minute: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  // If the time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Get interval in seconds for a frequency
 */
function getFrequencyInterval(frequency: NotificationFrequency): number | null {
  const DAY = 24 * 60 * 60;

  switch (frequency) {
    case 'none':
      return null;
    case 'daily':
      return DAY;
    case 'every_2_days':
      return 2 * DAY;
    case 'every_3_days':
      return 3 * DAY;
    case 'weekly':
      return 7 * DAY;
    case 'every_2_weeks':
      return 14 * DAY;
    case 'monthly':
      return 30 * DAY; // Approximate
    case 'quarterly':
      return 90 * DAY; // Approximate
    case 'semi_annually':
      return 180 * DAY; // Approximate
    case 'annually':
      return 365 * DAY; // Approximate
    default:
      return null;
  }
}

/**
 * Schedule notifications for fixed times
 */
async function scheduleFixedTimes(
  notifications: NonNullable<Awaited<ReturnType<typeof getNotificationsModule>>>,
  config: FixedTimeConfig
): Promise<ScheduleResult> {
  const notificationIds: string[] = [];

  for (const timeString of config.times) {
    const time = parseTime(timeString);
    if (!time) {
      console.warn(`Invalid time format: ${timeString}`);
      continue;
    }

    try {
      const trigger = {
        hour: time.hour,
        minute: time.minute,
        repeats: true,
      };

      const id = await notifications.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: config.data || {},
        },
        trigger,
      });

      notificationIds.push(id);
    } catch (error) {
      console.error(`Error scheduling notification for ${timeString}:`, error);
    }
  }

  return {
    success: notificationIds.length > 0,
    notificationIds,
    error: notificationIds.length === 0 ? 'Failed to schedule any notifications' : undefined,
  };
}

/**
 * Schedule interval-based notification
 */
async function scheduleInterval(
  notifications: NonNullable<Awaited<ReturnType<typeof getNotificationsModule>>>,
  config: IntervalConfig
): Promise<ScheduleResult> {
  try {
    const intervalSeconds = config.intervalHours * 60 * 60;

    const trigger = config.nextTriggerAt
      ? {
          date: config.nextTriggerAt,
        }
      : {
          seconds: intervalSeconds,
          repeats: true,
        };

    const id = await notifications.scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
      },
      trigger,
    });

    return {
      success: true,
      notificationIds: [id],
    };
  } catch (error) {
    console.error('Error scheduling interval notification:', error);
    return {
      success: false,
      notificationIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Schedule frequency-based notification
 */
async function scheduleFrequency(
  notifications: NonNullable<Awaited<ReturnType<typeof getNotificationsModule>>>,
  config: FrequencyConfig
): Promise<ScheduleResult> {
  if (config.frequency === 'none') {
    return {
      success: true,
      notificationIds: [],
    };
  }

  const time = parseTime(config.time);
  if (!time) {
    return {
      success: false,
      notificationIds: [],
      error: `Invalid time format: ${config.time}`,
    };
  }

  try {
    let trigger: {
      hour?: number;
      minute?: number;
      repeats: boolean;
      seconds?: number;
    };

    if (config.frequency === 'daily') {
      // Use daily trigger for daily notifications
      trigger = {
        hour: time.hour,
        minute: time.minute,
        repeats: true,
      };
    } else {
      // Use time interval for other frequencies
      const intervalSeconds = getFrequencyInterval(config.frequency);
      if (!intervalSeconds) {
        return {
          success: false,
          notificationIds: [],
          error: `Invalid frequency: ${config.frequency}`,
        };
      }

      trigger = {
        seconds: intervalSeconds,
        repeats: true,
      };
    }

    const id = await notifications.scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
      },
      trigger,
    });

    return {
      success: true,
      notificationIds: [id],
    };
  } catch (error) {
    console.error('Error scheduling frequency notification:', error);
    return {
      success: false,
      notificationIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Schedule a notification based on configuration
 */
export async function scheduleNotification(config: NotificationConfig): Promise<ScheduleResult> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return {
      success: false,
      notificationIds: [],
      error: 'Notifications module not available',
    };
  }

  try {
    switch (config.type) {
      case 'fixed_times':
        return await scheduleFixedTimes(notifications, config);
      case 'interval':
        return await scheduleInterval(notifications, config);
      case 'frequency':
        return await scheduleFrequency(notifications, config);
      default:
        return {
          success: false,
          notificationIds: [],
          error: 'Invalid notification configuration type',
        };
    }
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return {
      success: false,
      notificationIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Cancel a specific notification by ID
 */
export async function cancelNotification(notificationId: string): Promise<boolean> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return false;
  }

  try {
    await notifications.cancelScheduledNotificationAsync(notificationId);
    return true;
  } catch (error) {
    console.error('Error canceling notification:', error);
    return false;
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<boolean> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return false;
  }

  try {
    await notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (error) {
    console.error('Error canceling all notifications:', error);
    return false;
  }
}

/**
 * Get all scheduled notifications
 */
export async function getAllScheduledNotifications(): Promise<unknown[] | null> {
  const notifications = await getNotificationsModule();

  if (!notifications) {
    return null;
  }

  try {
    return await notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return null;
  }
}

/**
 * Get the count of scheduled notifications
 */
export async function getScheduledNotificationsCount(): Promise<number> {
  const scheduled = await getAllScheduledNotifications();
  return scheduled?.length || 0;
}
