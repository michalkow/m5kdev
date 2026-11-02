import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";

export const connect = appDatabaseSchema.table("connect", {
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
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

  // Provider-specific glue
  parentId: text("parent_id"), // e.g. FB Page’s connected IG business account, or org URN
  metadataJson: jsonb("metadata_json"),

  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
});
