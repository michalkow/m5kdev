import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

export const connect = sqliteTable("connect", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id").notNull(), // FK -> users.id

  provider: text("provider").notNull(), // e.g. "linkedin"
  accountType: text("account_type").notNull(), // "user" | "page" | "org" | "channel"
  providerAccountId: text("provider_account_id").notNull(), // e.g. LinkedIn URN, FB Page ID, IG business acct ID, X user ID
  handle: text("handle"), // @name or page slug
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),

  // OAuth credentials (ENCRYPTED)
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"), // may be null if provider doesn’t issue refresh tokens
  tokenType: text("token_type"), // e.g. "bearer"
  scope: text("scope"), // space- or comma-separated list, for auditing
  expiresAt: integer("expires_at", { mode: "timestamp" }), // epoch seconds

  // Provider-specific glue
  parentId: text("parent_id"), // e.g. FB Page’s connected IG business account, or org URN
  metadataJson: text("metadata_json", { mode: "json" }), // JSON string for extras (region, perms, etc.)

  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  lastRefreshedAt: integer("last_refreshed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});
