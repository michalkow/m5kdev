import { type AnySQLiteColumn, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, teams, users } from "../auth/auth.db";

export function createTagTables(
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
  const tags = sqliteTable("tags", {
    id: text("id").primaryKey().$default(uuidv4),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    userId: text("user_id")
      .notNull()
      .references(() => references.users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => references.organizations.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => references.teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    type: text("type"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    parentId: text("parent_id").references((): AnySQLiteColumn => tags.id, {
      onDelete: "set null",
    }),
    assignableTo: text("assignable_to", {
      mode: "json",
    })
      .notNull()
      .$type<string[]>(),
  });

  const taggings = sqliteTable("taggings", {
    id: text("id").primaryKey().$default(uuidv4),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
  });

  return {
    tags,
    taggings,
  };
}

const tagTables = createTagTables();

export const tags = tagTables.tags;
export const taggings = tagTables.taggings;
