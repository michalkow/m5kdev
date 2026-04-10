import { type AnySQLiteColumn, integer, sqliteTable as table, text } from "drizzle-orm/sqlite-core";
import { organizations, teams, users } from "@m5kdev/backend/modules/auth/auth.db";
import { v4 as uuidv4 } from "uuid";

export function createPostsTables(
  references: {
    users: { id: AnySQLiteColumn };
    organizations: { id: AnySQLiteColumn };
    teams: { id: AnySQLiteColumn };
  } = {
    users,
    organizations,
    teams,
  }
) {
  const posts = table("posts", {
    id: text("id").primaryKey().$default(uuidv4),
    authorUserId: text("author_user_id").references(() => references.users.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id").references(() => references.organizations.id, {
      onDelete: "set null",
    }),
    teamId: text("team_id").references(() => references.teams.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    status: text("status").$type<"draft" | "published">().notNull().default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  });

  return {
    posts,
  };
}

const postTables = createPostsTables();

export const posts = postTables.posts;
