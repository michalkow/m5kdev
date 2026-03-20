# @m5kdev/expo

Expo utilities and abstractions for m5kdev projects.

## Modules

### Notifications

A unified abstraction for `expo-notifications` that combines best practices from multiple implementations.

#### Key Features

- **Dev-safe**: Won't run in development mode to prevent Expo Go errors (configurable)
- **Type-safe**: Full TypeScript support with comprehensive types
- **Flexible scheduling**: Support for fixed times, intervals, and frequency-based notifications
- **Platform-aware**: Can be configured to run only on specific platforms
- **Lazy loading**: Dynamically imports expo-notifications only when needed
- **Android channels**: Built-in support for Android notification channels

#### Installation

```bash
pnpm add @m5kdev/expo expo-notifications
```

Make sure you have `expo-notifications` and `react-native` as peer dependencies in your project.

#### Basic Usage

```typescript
import {
  initializeNotifications,
  scheduleNotification,
  requestNotificationPermission,
} from '@m5kdev/expo/notifications';

// 1. Initialize (typically in App.tsx or _layout.tsx)
initializeNotifications({
  enableInDev: false, // Don't run in dev mode (default)
  enabledPlatforms: ['android', 'ios'],
  androidChannel: {
    channelId: 'default',
    channelName: 'Default Notifications',
    importance: 'HIGH',
  },
  handler: {
    handleNotification: {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    },
  },
});

// 2. Request permission
const status = await requestNotificationPermission();
if (status !== 'granted') {
  console.warn('Notification permission not granted');
}

// 3. Schedule notifications
await scheduleNotification({
  type: 'fixed_times',
  times: ['09:00', '14:00', '21:00'],
  title: 'Daily Reminder',
  body: 'Time for your check-in',
  data: { scheduleId: '123' },
});
```

#### Scheduling Patterns

**Fixed Times** (Daily notifications at specific times):

```typescript
await scheduleNotification({
  type: 'fixed_times',
  times: ['09:00', '14:00', '18:00'],
  title: 'Medication Reminder',
  body: 'Time to take your medicine',
  data: { medicineId: 'abc' },
});
```

**Intervals** (Every X hours):

```typescript
await scheduleNotification({
  type: 'interval',
  intervalHours: 6,
  title: 'Check-in Reminder',
  body: 'How are you feeling?',
  data: { type: 'check-in' },
});
```

**Intervals with specific next trigger**:

```typescript
await scheduleNotification({
  type: 'interval',
  intervalHours: 24,
  nextTriggerAt: new Date('2026-03-20T10:00:00'),
  title: 'Daily Check-in',
  body: 'Time for your daily check-in',
});
```

**Frequency-based** (Daily, weekly, monthly, etc.):

```typescript
await scheduleNotification({
  type: 'frequency',
  frequency: 'weekly',
  time: '10:00',
  title: 'Weekly Check-in',
  body: 'Time for your weekly check-in',
});
```

Available frequencies:
- `'none'`, `'daily'`, `'every_2_days'`, `'every_3_days'`
- `'weekly'`, `'every_2_weeks'`
- `'monthly'`, `'quarterly'`, `'semi_annually'`, `'annually'`

#### Permissions

```typescript
// Request permission
const status = await requestNotificationPermission();
// Returns: 'granted' | 'denied' | 'undetermined'

// Check current status
const status = await getNotificationPermissionStatus();

// Check if granted
const hasPermission = await hasNotificationPermission();

// Ensure permission (request if needed)
const granted = await ensureNotificationPermission();
```

#### Managing Notifications

```typescript
// Cancel a specific notification
await cancelNotification(notificationId);

// Cancel all notifications
await cancelAllNotifications();

// Get all scheduled notifications
const scheduled = await getAllScheduledNotifications();

// Get count of scheduled notifications
const count = await getScheduledNotificationsCount();
```

#### Listeners

```typescript
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from '@m5kdev/expo/notifications';

// Listen for notifications received while app is foregrounded
const subscription = addNotificationReceivedListener((notification) => {
  console.log('Received:', notification);
});

// Listen for user tapping on notifications
const responseSubscription = addNotificationResponseReceivedListener((response) => {
  console.log('User tapped:', response);
  // Navigate or handle the notification tap
});

// Remove listeners when done
subscription?.remove();
responseSubscription?.remove();
```

#### Android Channels

```typescript
import { setupAndroidChannel } from '@m5kdev/expo/notifications';

// Setup a custom channel
await setupAndroidChannel({
  channelId: 'reminders',
  channelName: 'Reminders',
  importance: 'HIGH',
  sound: 'default',
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#2563eb',
  enableVibrate: true,
  enableLights: true,
  showBadge: true,
});

// Delete a channel
await deleteAndroidChannel('reminders');

// Get all channels
const channels = await getAndroidChannels();
```

#### Utility Functions

```typescript
import {
  isNotificationsAvailable,
  getPlatform,
  shouldEnableNotifications,
} from '@m5kdev/expo/notifications';

// Check if notifications are available
const available = isNotificationsAvailable();

// Get current platform
const platform = getPlatform(); // 'ios' | 'android' | 'web' | 'unknown'

// Check if notifications should be enabled based on config
const shouldEnable = shouldEnableNotifications();
```

#### Configuration Options

```typescript
interface NotificationInitOptions {
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
  handler?: {
    handleNotification: {
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    };
  };
}
```

#### Migration Guide

**From HarmReduction:**

```typescript
// Before
import { syncScheduledNotifications } from '../notifications';

// After
import { scheduleNotification, cancelAllNotifications } from '@m5kdev/expo/notifications';

// Initialize with dev mode disabled (same behavior)
initializeNotifications({ enableInDev: false, enabledPlatforms: ['android'] });
```

**From HomeDoctor:**

```typescript
// Before
import { scheduleFixedTimeNotifications } from '../services/notification-service';

// After
import { scheduleNotification } from '@m5kdev/expo/notifications';

await scheduleNotification({
  type: 'fixed_times',
  times: ['09:00', '14:00'],
  title: 'Medicine Time',
  body: 'Take your medicine',
});
```

**From DepressionChecklist:**

```typescript
// Before
import { scheduleReminders } from '../services/NotificationService';

// After
import { scheduleNotification } from '@m5kdev/expo/notifications';

await scheduleNotification({
  type: 'frequency',
  frequency: 'daily',
  time: '10:00',
  title: 'Daily Check-in',
  body: 'Complete your checklist',
});
```

#### Best Practices

1. **Initialize early**: Call `initializeNotifications()` in your app's root component
2. **Request permissions**: Always request permissions before scheduling notifications
3. **Handle errors**: The API returns success/error states - check them
4. **Clean up listeners**: Remove notification listeners when components unmount
5. **Test on device**: Notifications don't work in Expo Go when dev mode is disabled
6. **Use data payloads**: Pass custom data to notifications for handling taps

## License

GPL-3.0-only
