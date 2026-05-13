import { organizations, users } from "@m5kdev/backend/modules/auth/auth.db";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey().$default(uuidv4),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => users.id),
  organizationId: text("organization_id").references(() => organizations.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});
