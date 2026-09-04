import { integer, sqliteTable as table, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, users } from "../auth/auth.db";

export const mcpAllowlistEntries = table(
  "mcp_allowlist_entries",
  {
    id: text("id").primaryKey().$default(uuidv4),
    oauthClientId: text("oauth_client_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [
    uniqueIndex("mcp_allowlist_client_user_org_unique").on(
      t.oauthClientId,
      t.userId,
      t.organizationId
    ),
  ]
);
