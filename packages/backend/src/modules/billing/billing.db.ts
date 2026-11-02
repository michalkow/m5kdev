import type { StripeEnvironment } from "@m5kdev/commons/modules/billing/billing.types";
import { sql } from "drizzle-orm";
import { boolean, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";

export const subscriptions = appDatabaseSchema.table(
  "subscriptions",
  {
    id: text("id").primaryKey().$default(uuidv4),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    environment: text("environment").$type<StripeEnvironment>(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }),
    priceId: text("price_id"),
    interval: text("interval"),
    intervalCount: integer("interval_count"),
    intervalPicked: boolean("interval_picked").default(false),
    unitAmount: integer("unit_amount"),
    discounts: text("discounts").array().$type<string[]>(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end"),
    cancelAt: timestamp("cancel_at", { withTimezone: true, mode: "date" }),
    canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
    seats: integer("seats"),
    memberId: text("member_id"),
    trialStart: timestamp("trial_start", { withTimezone: true, mode: "date" }),
    trialEnd: timestamp("trial_end", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("subscriptions_reference_environment_unique")
      .on(t.referenceId, t.environment)
      .where(sql`${t.environment} is not null`),
  ]
);
