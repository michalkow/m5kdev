import type {
  NotificationPlatform,
  NotificationProvider,
  NotificationSendStatus,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { integer, sqliteTable as table, text } from "drizzle-orm/sqlite-core";
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

export const notificationSendLogs = table("notification_send_logs", {
  id: text("id").primaryKey().$default(uuidv4),
  batchId: text("batch_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id")
    .notNull()
    .references(() => notificationDevices.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().$type<NotificationProvider>(),
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
