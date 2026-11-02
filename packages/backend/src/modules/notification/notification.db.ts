import type {
  NotificationChannel,
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { boolean, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { members, users } from "../auth/auth.db";

export const notificationDevices = appDatabaseSchema.table("notification_devices", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().$type<NotificationPlatform>(),
  endpoint: text("endpoint").unique(),
  subscription: jsonb("subscription").$type<Record<string, unknown> | null>(),
  token: text("token").unique(),
  label: text("label"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
});

export const notifications = appDatabaseSchema.table("notifications", {
  id: text("id").primaryKey().$default(uuidv4),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data").$type<Record<string, unknown> | null>(),
  visibleInInbox: boolean("visible_in_inbox").notNull().default(false),
  armedChannels: text("armed_channels")
    .array()
    .notNull()
    .$type<NotificationChannel[]>()
    .default([]),
  webPushedAt: timestamp("web_pushed_at", { withTimezone: true, mode: "date" }),
  mobilePushedAt: timestamp("mobile_pushed_at", { withTimezone: true, mode: "date" }),
  emailedAt: timestamp("emailed_at", { withTimezone: true, mode: "date" }),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
});

export const notificationPreferences = appDatabaseSchema.table(
  "notification_preferences",
  {
    id: text("id").primaryKey().$default(uuidv4),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull().$type<NotificationChannel>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [
    uniqueIndex("notification_preferences_member_kind_channel_unique").on(
      t.memberId,
      t.kind,
      t.channel
    ),
  ]
);

export const notificationSendLogs = appDatabaseSchema.table("notification_send_logs", {
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
  data: jsonb("data").$type<Record<string, unknown> | null>(),
  status: text("status").notNull().$type<NotificationSendStatus>(),
  error: text("error"),
  jobId: text("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
});
