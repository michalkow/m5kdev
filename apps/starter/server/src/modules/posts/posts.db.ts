import { appDatabaseSchema } from "@m5kdev/backend/base/database.schema";
import { members, organizations, users } from "@m5kdev/backend/modules/auth/auth.db";
import { text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";

export const posts = appDatabaseSchema.table("posts", {
  id: text("id").primaryKey().$default(uuidv4),
  authorUserId: text("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  memberId: text("member_id").references(() => members.id, {
    onDelete: "set null",
  }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  teamId: text("team_id"),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  status: text("status").$type<"draft" | "published">().notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
});
