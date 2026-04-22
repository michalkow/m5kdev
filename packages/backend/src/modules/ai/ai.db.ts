import { integer, real, sqliteTable as table, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, teams, users } from "../auth/auth.db";

export const chats = table("chats", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  type: text("type"),
  conversation: text("conversation", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const aiUsage = table("ai_usage", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  feature: text("feature").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  cost: real("cost"),
  traceId: text("trace_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  metadata: text("metadata", { mode: "json" }),
});
