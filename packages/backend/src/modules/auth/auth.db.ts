import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";

export const users = appDatabaseSchema.table("users", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true, mode: "date" }),
  preferences: jsonb("preferences").default({}).$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
  onboarding: integer("onboarding"),
  flags: text("flags").array().default([]).$type<string[]>(),
  locale: text("locale"),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
});

export const sessions = appDatabaseSchema.table("sessions", {
  id: text("id").primaryKey().$default(uuidv4),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
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

export const accounts = appDatabaseSchema.table(
  "accounts",
  {
    id: text("id").primaryKey().$default(uuidv4),
    accountId: text("account_id").notNull(),
    issuer: text("issuer").notNull().default("local:credential"),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [uniqueIndex("accounts_issuer_account_id_unique").on(t.issuer, t.accountId)]
);

export const verifications = appDatabaseSchema.table("verifications", {
  id: text("id").primaryKey().$default(uuidv4),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).$default(
    () => new Date()
  ),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).$default(
    () => new Date()
  ),
});

export const organizations = appDatabaseSchema.table("organizations", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  type: text("type"),
  parentId: text("parent_id").references((): AnyPgColumn => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  onboarding: integer("onboarding"),
  preferences: jsonb("preferences").default({}).$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
  flags: text("flags").array().default([]).$type<string[]>(),
  locale: text("locale"),
  currency: text("currency"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSandboxCustomerId: text("stripe_sandbox_customer_id").unique(),
  billingExempt: boolean("billing_exempt").notNull().default(false),
  allowCardlessTrial: boolean("allow_cardless_trial").notNull().default(false),
  cardlessTrialConsumed: jsonb("cardless_trial_consumed")
    .default({})
    .$type<Partial<Record<"production" | "sandbox", boolean>>>(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
});

export const members = appDatabaseSchema.table(
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
    /** Soft-delete timestamp; active membership requires this to be null. */
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    preferences: jsonb("preferences").default({}).$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    onboarding: integer("onboarding"),
    flags: text("flags").array().default([]).$type<string[]>(),
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

export const invitations = appDatabaseSchema.table("invitations", {
  id: text("id").primaryKey().$default(uuidv4),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  memberId: text("member_id").references(() => members.id),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id),
});

export const apikeys = appDatabaseSchema.table("apikeys", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  configId: text("config_id").notNull().default("default"),
  referenceId: text("reference_id").notNull(),
  userId: text("user_id").references(() => users.id),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: timestamp("last_refill_at", { withTimezone: true, mode: "date" }),
  enabled: boolean("enabled").notNull(),
  rateLimitEnabled: boolean("rate_limit_enabled").notNull(),
  rateLimitTimeWindow: integer("rate_limit_time_window"),
  rateLimitMax: integer("rate_limit_max"),
  requestCount: integer("request_count").notNull(),
  remaining: integer("remaining"),
  lastRequest: timestamp("last_request", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  permissions: text("permissions"),
  metadata: text("metadata"),
});

export const waitlist = appDatabaseSchema.table("waitlist", {
  id: text("id").primaryKey().$default(uuidv4),
  name: text("name"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  status: text("status").notNull().default("WAITLIST"),
  code: text("code"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  userId: text("user_id").references(() => users.id),
});

export const accountClaims = appDatabaseSchema.table("account_claims", {
  id: text("id").primaryKey().$default(uuidv4),
  claimUserId: text("claim_user_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull(),
  code: text("code"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  claimedEmail: text("claimed_email"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
});

export const accountClaimMagicLinks = appDatabaseSchema.table("account_claim_magic_links", {
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
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$default(() => new Date()),
});
