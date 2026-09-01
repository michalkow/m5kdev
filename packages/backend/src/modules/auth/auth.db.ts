import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  stripeCustomerId: text("stripe_customer_id").unique(),
  preferences: text("preferences", { mode: "json" }).default({}).$type<Record<string, unknown>>(),
  metadata: text("metadata", { mode: "json" }).default({}).$type<Record<string, unknown>>(),
  onboarding: integer("onboarding"),
  flags: text("flags", { mode: "json" }).default([]).$type<string[]>(),
  locale: text("locale"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$default(uuidv4),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
  activeOrganizationId: text("active_organization_id"),
  activeOrganizationMemberId: text("active_organization_member_id"),
  activeOrganizationRole: text("active_organization_role"),
  activeOrganizationType: text("active_organization_type"),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey().$default(uuidv4),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey().$default(uuidv4),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$default(() => new Date()),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  type: text("type"),
  parentId: text("parent_id").references((): AnySQLiteColumn => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  onboarding: integer("onboarding"),
  preferences: text("preferences", { mode: "json" }).default({}).$type<Record<string, unknown>>(),
  metadata: text("metadata", { mode: "json" }).default({}).$type<Record<string, unknown>>(),
  flags: text("flags", { mode: "json" }).default([]).$type<string[]>(),
  locale: text("locale"),
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey().$default(uuidv4),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").references(() => users.id),
    email: text("email"),
    /** Snapshot of the user's display name for attribution after leave/remove. */
    name: text("name").notNull().default(""),
    /** Snapshot of the user's image (e.g. OAuth avatar) for attribution after leave/remove. */
    image: text("image"),
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    /** Soft-delete timestamp; active membership requires this to be null. */
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    preferences: text("preferences", { mode: "json" }).default({}).$type<Record<string, unknown>>(),
    metadata: text("metadata", { mode: "json" }).default({}).$type<Record<string, unknown>>(),
    onboarding: integer("onboarding"),
    flags: text("flags", { mode: "json" }).default([]).$type<string[]>(),
  },
  (t) => [
    uniqueIndex("members_attached_user_organization_unique")
      .on(t.userId, t.organizationId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("members_live_pending_email_organization_unique")
      .on(t.email, t.organizationId)
      .where(sql`${t.userId} is null and ${t.deletedAt} is null`),
  ]
);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey().$default(uuidv4),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  memberId: text("member_id").references(() => members.id),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id),
});

export const apikeys = sqliteTable("apikeys", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  refillInterval: integer("refill_interval", { mode: "number" }),
  refillAmount: integer("refill_amount", { mode: "number" }),
  lastRefillAt: integer("last_refill_at", { mode: "timestamp" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).notNull(),
  rateLimitTimeWindow: integer("rate_limit_time_window", { mode: "number" }),
  rateLimitMax: integer("rate_limit_max", { mode: "number" }),
  requestCount: integer("request_count", { mode: "number" }).notNull(),
  remaining: integer("remaining", { mode: "number" }),
  lastRequest: integer("last_request", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  permissions: text("permissions"),
  metadata: text("metadata"),
});

export const waitlist = sqliteTable("waitlist", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name"),
  email: text("email"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  status: text("status").notNull().default("WAITLIST"),
  code: text("code"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  userId: text("user_id").references(() => users.id),
});

export const accountClaims = sqliteTable("account_claims", {
  id: text("id").primaryKey().$default(uuidv4),
  claimUserId: text("claim_user_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull(),
  code: text("code"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  claimedAt: integer("claimed_at", { mode: "timestamp" }),
  claimedEmail: text("claimed_email"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const accountClaimMagicLinks = sqliteTable("account_claim_magic_links", {
  id: text("id").primaryKey().$default(uuidv4),
  claimId: text("claim_id")
    .notNull()
    .references(() => accountClaims.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull(),
  url: text("url").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});
