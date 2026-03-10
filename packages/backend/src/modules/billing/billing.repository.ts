import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { and, desc, eq, type InferSelectModel, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { Stripe } from "stripe";
import * as auth from "../auth/auth.db";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseTableRepository } from "../base/base.repository";
import * as billing from "./billing.db";
import { posthogCapture } from "../../utils/posthog";

const schema = { ...auth, ...billing };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class BillingRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["subscriptions"]
> {
  public stripe: Stripe;
  public plans: StripePlan[];
  public trial?: StripePlan;

  constructor(options: {
    orm: Orm;
    schema: Schema;
    table: Schema["subscriptions"];
    libs: { stripe: Stripe };
    config: {
      trial?: StripePlan;
      plans: StripePlan[];
    };
  }) {
    const { libs, config, ...rest } = options;
    super(rest);
    this.stripe = libs.stripe;
    this.plans = config.plans;
    this.trial = config.trial;
  }
  hasTrial(): boolean {
    return !!this.trial;
  }

  getPlanByPriceId(priceId: string): StripePlan | undefined {
    return this.plans.find(
      (plan) => plan.priceId === priceId || plan.annualDiscountPriceId === priceId
    );
  }

  getCustomerByEmail(email: string): ServerResultAsync<Stripe.Customer | null> {
    return this.throwableAsync(async () => {
      const customers = await this.stripe.customers.list({
        email,
        limit: 1,
      });
      return ok(customers.data[0] ?? null);
    });
  }

  getUserByCustomerId(
    customerId: string
  ): ServerResultAsync<InferSelectModel<Schema["users"]> | null> {
    return this.throwableAsync(async () => {
      const [user] = await this.orm
        .select()
        .from(this.schema.users)
        .where(eq(this.schema.users.stripeCustomerId, customerId))
        .limit(1);
      return ok(user ?? null);
    });
  }

  createCustomer({
    email,
    name,
    userId,
  }: {
    email: string;
    name?: string;
    userId: string;
  }): ServerResultAsync<Stripe.Customer> {
    return this.throwableAsync(async () => {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });
      return ok(customer);
    });
  }

  async createTrialSubscription(customerId: string): ServerResultAsync<Stripe.Subscription> {
    if (!this.trial) return this.error("NOT_FOUND", "Trial plan not found");
    const stripeSubscription = await this.createSubscription({
      customerId,
      priceId: this.trial.priceId,
      trialDays: this.trial.freeTrial?.days ?? 7,
    });
    if (stripeSubscription.isErr()) return err(stripeSubscription.error);
    if (!stripeSubscription.value)
      return this.error("INTERNAL_SERVER_ERROR", "Failed to create trial subscription");
    return ok(stripeSubscription.value);
  }

  createSubscription({
    customerId,
    priceId,
    quantity = 1,
    trialDays,
  }: {
    customerId: string;
    priceId: string;
    quantity?: number;
    trialDays?: number;
  }): ServerResultAsync<Stripe.Subscription> {
    return this.throwableAsync(async () => {
      const stripeSubscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity }], // quantity = seats if you want
        ...(trialDays
          ? {
              trial_period_days: trialDays,
              trial_settings: {
                end_behavior: {
                  missing_payment_method: "cancel",
                },
              },
            }
          : {}),
      });
      return ok(stripeSubscription);
    });
  }

  updateUserCustomerId({
    userId,
    customerId,
  }: {
    userId: string;
    customerId: string;
  }): ServerResultAsync<InferSelectModel<Schema["users"]>> {
    return this.throwableAsync(async () => {
      const [user] = await this.orm
        .update(this.schema.users)
        .set({ stripeCustomerId: customerId })
        .where(eq(this.schema.users.id, userId))
        .returning();
      if (!user) return this.error("NOT_FOUND", "User not found");
      return ok(user);
    });
  }

  getLatestSubscription(referenceId: string): ServerResultAsync<BillingSchema | null> {
    return this.throwableAsync(async () => {
      const subscriptions = await this.orm
        .select()
        .from(this.schema.subscriptions)
        .where(eq(this.schema.subscriptions.referenceId, referenceId))
        .orderBy(desc(this.schema.subscriptions.createdAt))
        .limit(1);

      return ok(subscriptions[0] ?? null);
    });
  }

  getActiveSubscription(referenceId: string): ServerResultAsync<BillingSchema | null> {
    return this.throwableAsync(async () => {
      const [subscription] = await this.orm
        .select()
        .from(this.schema.subscriptions)
        .where(
          and(
            eq(this.schema.subscriptions.referenceId, referenceId),
            inArray(this.schema.subscriptions.status, ["active", "trialing"])
          )
        )
        .orderBy(desc(this.schema.subscriptions.createdAt))
        .limit(1);

      return ok(subscription ?? null);
    });
  }

  listInvoices(customerId: string): ServerResultAsync<Stripe.Invoice[]> {
    return this.throwableAsync(async () => {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
      });
      return ok(invoices.data);
    });
  }

  createCheckoutSession({
    customerId,
    priceId,
    userId,
  }: {
    customerId: string;
    priceId: string;
    userId: string;
  }): ServerResultAsync<Stripe.Checkout.Session> {
    return this.throwableAsync(async () => {
      const session = await this.stripe.checkout.sessions.create({
        client_reference_id: userId,
        customer: customerId,
        success_url: `${process.env.VITE_SERVER_URL}/stripe/success`,
        cancel_url: `${process.env.VITE_APP_URL}/billing`,
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
      });
      return ok(session);
    });
  }

  createBillingPortalSession(customerId: string): ServerResultAsync<Stripe.BillingPortal.Session> {
    return this.throwableAsync(async () => {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.VITE_SERVER_URL}/stripe/success`,
      });
      return ok(session);
    });
  }

  async syncStripeData({
    customerId,
    userId,
  }: {
    customerId: string;
    userId: string;
  }): ServerResultAsync<boolean> {
    return this.throwableAsync(async () => {
      // Fetch latest subscription data from Stripe

      const stripeSubscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: "all",
        expand: ["data.default_payment_method"],
      });
      const [stripeSubscription] = stripeSubscriptions.data;
      if (!stripeSubscription) return this.error("NOT_FOUND", "Subscription not found");

      const plan = this.getPlanByPriceId(stripeSubscription.items.data[0]?.price.id!);
      if (!plan)
        return this.error(
          "NOT_FOUND",
          `Plan not found for price ID: ${stripeSubscription.items.data[0]?.price.id}`
        );

      const values = {
        stripeCustomerId: customerId,
        referenceId: userId,
        plan: plan.name,
        status: stripeSubscription.status,
        seats: stripeSubscription.items.data[0]?.quantity || 1,
        periodEnd: new Date(stripeSubscription.items.data[0]?.current_period_end! * 1000),
        periodStart: new Date(stripeSubscription.items.data[0]?.current_period_start! * 1000),
        priceId: stripeSubscription.items.data[0]?.price.id!,
        interval: stripeSubscription.items.data[0]?.price.recurring?.interval,
        unitAmount: stripeSubscription.items.data[0]?.price.unit_amount,
        discounts: stripeSubscription.discounts.map((discount) =>
          typeof discount === "string" ? discount : discount.id
        ),
        stripeSubscriptionId: stripeSubscription.id,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        cancelAt: stripeSubscription.cancel_at
          ? new Date(stripeSubscription.cancel_at * 1000)
          : null,
        canceledAt: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000)
          : null,
        ...(stripeSubscription.trial_start && stripeSubscription.trial_end
          ? {
              trialStart: new Date(stripeSubscription.trial_start * 1000),
              trialEnd: new Date(stripeSubscription.trial_end * 1000),
            }
          : {}),
      };

      const existingSubscription = await this.getActiveSubscription(userId);
      if (existingSubscription.isErr()) return err(existingSubscription.error);

      if (!existingSubscription.value) {
        await this.orm.insert(this.schema.subscriptions).values(values);
        posthogCapture({
          distinctId: userId,
          event: "stripe.subscription_created",
          properties: values,
        });
        return ok(true);
      }

      await this.orm
        .update(this.schema.subscriptions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(this.schema.subscriptions.id, existingSubscription.value.id));
      posthogCapture({
        distinctId: userId,
        event: "stripe.subscription_updated",
        properties: values,
      });

      return ok(false);
    });
  }

  constructEvent(
    body: Buffer | string,
    signature: string,
    secret: string
  ): ServerResult<Stripe.Event> {
    return this.throwable(() => {
      const event = this.stripe.webhooks.constructEvent(body, signature, secret);
      return ok(event);
    });
  }
}
