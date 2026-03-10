import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey().$default(uuidv4),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  plan: text("plan").notNull(),
  referenceId: text("reference_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull(),
  periodStart: integer("period_start", { mode: "timestamp" }),
  periodEnd: integer("period_end", { mode: "timestamp" }),
  priceId: text("price_id"),
  interval: text("interval"),
  unitAmount: integer("unit_amount", { mode: "number" }),
  discounts: text("discounts", { mode: "json" }).$type<string[]>(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }),
  cancelAt: integer("cancel_at", { mode: "timestamp" }),
  canceledAt: integer("canceled_at", { mode: "timestamp" }),
  seats: integer("seats", { mode: "number" }),
  trialStart: integer("trial_start", { mode: "timestamp" }),
  trialEnd: integer("trial_end", { mode: "timestamp" }),
});
