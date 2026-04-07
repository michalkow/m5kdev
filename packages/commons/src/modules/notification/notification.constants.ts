export const NOTIFICATION_PLATFORMS = ["web", "ios", "android"] as const;
export type NotificationPlatform = (typeof NOTIFICATION_PLATFORMS)[number];

export const NOTIFICATION_PROVIDERS = ["web", "apn", "fcm"] as const;
export type NotificationProvider = (typeof NOTIFICATION_PROVIDERS)[number];

export const NOTIFICATION_SEND_STATUSES = ["pending", "sent", "failed"] as const;
export type NotificationSendStatus = (typeof NOTIFICATION_SEND_STATUSES)[number];

export const NOTIFICATION_DELIVER_JOB_NAME = "notification.deliver" as const;
