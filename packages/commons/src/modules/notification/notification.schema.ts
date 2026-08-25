import { z } from "zod";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PLATFORMS,
  NOTIFICATION_PROVIDERS,
  NOTIFICATION_SEND_STATUSES,
} from "./notification.constants";

export const notificationPlatformSchema = z.enum(NOTIFICATION_PLATFORMS);
export const notificationProviderSchema = z.enum(NOTIFICATION_PROVIDERS);
export const notificationSendStatusSchema = z.enum(NOTIFICATION_SEND_STATUSES);

/** Web Push `PushSubscriptionJSON` subset we persist and accept from clients. */
export const pushSubscriptionJsonSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const notificationRegisterDeviceInputSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("web"),
    subscription: pushSubscriptionJsonSchema,
    label: z.string().max(120).optional(),
  }),
  z.object({
    platform: z.literal("ios"),
    token: z.string().min(1).max(4096),
    label: z.string().max(120).optional(),
  }),
  z.object({
    platform: z.literal("android"),
    token: z.string().min(1).max(4096),
    label: z.string().max(120).optional(),
  }),
]);

export type NotificationRegisterDeviceInput = z.infer<typeof notificationRegisterDeviceInputSchema>;

export const notificationRegisterDeviceOutputSchema = z.object({
  deviceId: z.string(),
});

export const notificationUnregisterDeviceInputSchema = z.object({
  deviceId: z.string(),
});

export const notificationUnregisterDeviceOutputSchema = z.object({
  ok: z.literal(true),
});

export const notificationDeviceSelectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  platform: notificationPlatformSchema,
  endpoint: z.string().nullable(),
  label: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const notificationListDevicesOutputSchema = z.array(notificationDeviceSelectSchema);

export const notificationVapidPublicKeyOutputSchema = z.object({
  publicKey: z.string(),
});

export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

export const notificationSendLogSelectSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  notificationId: z.string(),
  userId: z.string(),
  deviceId: z.string().nullable(),
  channel: notificationChannelSchema,
  provider: notificationProviderSchema.nullable(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  status: notificationSendStatusSchema,
  error: z.string().nullable(),
  jobId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const notificationListSendLogsInputSchema = z.object({
  batchId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const notificationListSendLogsOutputSchema = z.array(notificationSendLogSelectSchema);

export const notificationInstanceSelectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  visibleInInbox: z.boolean(),
  webPushedAt: z.date().nullable(),
  mobilePushedAt: z.date().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const notificationListInboxOutputSchema = z.array(notificationInstanceSelectSchema);

export const notificationMarkReadInputSchema = z.object({
  id: z.string(),
});

export const notificationSendTestInputSchema = z.object({
  userId: z.string().optional(),
  kind: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const notificationSendTestOutputSchema = z.object({
  id: z.string(),
});

export const notificationKindPreferenceChannelSchema = z.object({
  channel: notificationChannelSchema,
  enabled: z.boolean(),
});

export const notificationKindPreferenceSchema = z.object({
  kind: z.string(),
  channels: z.array(notificationKindPreferenceChannelSchema),
});

export const notificationListPreferencesOutputSchema = z.array(notificationKindPreferenceSchema);

export const notificationSetPreferenceInputSchema = z.object({
  kind: z.string().min(1),
  channel: notificationChannelSchema,
  enabled: z.boolean(),
});

export const notificationSetPreferenceOutputSchema = notificationKindPreferenceSchema;
