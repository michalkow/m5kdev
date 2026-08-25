export const NOTIFICATION_PLATFORMS = ["web", "ios", "android"] as const;
export type NotificationPlatform = (typeof NOTIFICATION_PLATFORMS)[number];

export const NOTIFICATION_PROVIDERS = ["web", "apn", "fcm"] as const;
export type NotificationProvider = (typeof NOTIFICATION_PROVIDERS)[number];

export const NOTIFICATION_SEND_STATUSES = ["pending", "sent", "failed"] as const;
export type NotificationSendStatus = (typeof NOTIFICATION_SEND_STATUSES)[number];

export const NOTIFICATION_DELIVER_JOB_NAME = "notification.deliver" as const;

export const NOTIFICATION_CHANNELS = ["in-app", "web-push", "mobile-push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationKindDelays {
  readonly webPushMs?: number;
  readonly mobilePushMs?: number;
  readonly emailMs?: number;
}

export interface NotificationKind {
  readonly id: string;
  readonly defaultChannels: readonly NotificationChannel[];
  readonly delays?: NotificationKindDelays;
  readonly emailTemplate?: string;
}
