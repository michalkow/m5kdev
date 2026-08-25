import type {
  NotificationChannel,
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { integer, sqliteTable as table, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { users } from "../auth/auth.db";

export const notificationDevices = table("notification_devices", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().$type<NotificationPlatform>(),
  endpoint: text("endpoint").unique(),
  subscription: text("subscription", { mode: "json" }).$type<Record<string, unknown> | null>(),
  token: text("token").unique(),
  label: text("label"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const notifications = table("notifications", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown> | null>(),
  visibleInInbox: integer("visible_in_inbox", { mode: "boolean" }).notNull().default(false),
  armedChannels: text("armed_channels", { mode: "json" })
    .notNull()
    .$type<NotificationChannel[]>()
    .default([]),
  webPushedAt: integer("web_pushed_at", { mode: "timestamp" }),
  mobilePushedAt: integer("mobile_pushed_at", { mode: "timestamp" }),
  emailedAt: integer("emailed_at", { mode: "timestamp" }),
  readAt: integer("read_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const notificationPreferences = table(
  "notification_preferences",
  {
    id: text("id").primaryKey().$default(uuidv4),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull().$type<NotificationChannel>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [
    uniqueIndex("notification_preferences_user_kind_channel_unique").on(
      t.userId,
      t.kind,
      t.channel
    ),
  ]
);

export const notificationSendLogs = table("notification_send_logs", {
  id: text("id").primaryKey().$default(uuidv4),
  batchId: text("batch_id").notNull(),
  notificationId: text("notification_id")
    .notNull()
    .references(() => notifications.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id").references(() => notificationDevices.id, { onDelete: "set null" }),
  channel: text("channel").notNull().$type<NotificationChannel>(),
  provider: text("provider").$type<NotificationProvider | null>(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown> | null>(),
  status: text("status").notNull().$type<NotificationSendStatus>(),
  error: text("error"),
  jobId: text("job_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});
