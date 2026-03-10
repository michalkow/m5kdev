import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
  paymentCustomerId: text("payment_customer_id").unique(),
  paymentPlanTier: text("payment_plan_tier"),
  paymentPlanExpiresAt: integer("payment_plan_expires_at", {
    mode: "timestamp",
  }),
  preferences: text("preferences"),
  metadata: text("metadata", { mode: "json" })
    .notNull()
    .default({})
    .$type<Record<string, unknown>>(),
  onboarding: integer("onboarding"),
  flags: text("flags"),
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
  activeOrganizationRole: text("active_organization_role"),
  activeTeamId: text("active_team_id"),
  activeTeamRole: text("active_team_role"),
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  metadata: text("metadata"),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey().$default(uuidv4),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name").notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const teamMembers = sqliteTable("teammembers", {
  id: text("id").primaryKey().$default(uuidv4),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey().$default(uuidv4),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  teamId: text("team_id").references(() => teams.id),
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
  type: text("type").notNull().default("WAITLIST"),
  code: text("code"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  userId: text("user_id").references(() => users.id),
  claimUserId: text("claim_user_id").references(() => users.id),
  claimedAt: integer("claimed_at", { mode: "timestamp" }),
  claimedEmail: text("claimed_email"),
});

export const accountClaimMagicLinks = sqliteTable("account_claim_magic_links", {
  id: text("id").primaryKey().$default(uuidv4),
  claimId: text("claim_id")
    .notNull()
    .references(() => waitlist.id, { onDelete: "cascade" }),
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
