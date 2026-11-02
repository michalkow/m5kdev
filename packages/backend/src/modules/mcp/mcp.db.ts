import { text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { organizations, users } from "../auth/auth.db";

export const mcpAllowlistEntries = appDatabaseSchema.table(
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
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
