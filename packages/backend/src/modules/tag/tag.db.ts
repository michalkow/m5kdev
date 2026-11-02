import { type AnyPgColumn, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { members, organizations, users } from "../auth/auth.db";

export const tags = appDatabaseSchema.table("tags", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  teamId: text("team_id"),
  name: text("name").notNull(),
  color: text("color"),
  type: text("type"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  parentId: text("parent_id").references((): AnyPgColumn => tags.id, {
    onDelete: "set null",
  }),
  assignableTo: text("assignable_to").array().notNull().$type<string[]>(),
});

export const taggings = appDatabaseSchema.table("taggings", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  tagId: text("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
});
