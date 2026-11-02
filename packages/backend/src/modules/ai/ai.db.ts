import { doublePrecision, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { members, organizations, users } from "../auth/auth.db";

export const chats = appDatabaseSchema.table("chats", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  type: text("type"),
  conversation: jsonb("conversation"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).$default(
    () => new Date()
  ),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
});

export const aiUsage = appDatabaseSchema.table("ai_usage", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
  teamId: text("team_id"),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  feature: text("feature").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  cost: doublePrecision("cost"),
  traceId: text("trace_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  metadata: jsonb("metadata"),
});
