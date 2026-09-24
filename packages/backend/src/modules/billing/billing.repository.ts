import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import type {
  ResolvedStripePlans,
  StripePlan,
} from "@m5kdev/commons/modules/billing/billing.types";
import {
  findDefaultTrialPrice,
  findPlanByPriceId,
  findPriceCurrency,
  findTrialPlan,
} from "@m5kdev/commons/modules/billing/billing.utils";
import type { InferSelectModel } from "drizzle-orm";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { Stripe } from "stripe";
import { posthogCapture } from "../../utils/posthog";
import * as auth from "../auth/auth.db";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseTableRepository } from "../base/base.repository";
import * as billing from "./billing.db";

const schema = { ...auth, ...billing };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

const ACCESS_STATUSES = ["active", "trialing", "past_due"] as const;
const OPEN_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"] as const;

export class BillingRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["subscriptions"]
> {
  public stripe: Stripe;
  public plans: StripePlan[];
  public trialPlanName: Record<string, string>;
  public trialRequiresPaymentMethod: boolean;
  public defaultCurrency: string;
  public seatBilling: boolean;
  public nonBillableRoleKeys: readonly string[];

  constructor(options: {
    orm: Orm;
    schema: Schema;
    table: Schema["subscriptions"];
    libs: { stripe: Stripe };
    config: ResolvedStripePlans;
  }) {
    const { libs, config, ...rest } = options;
    super(rest);
    this.stripe = libs.stripe;
    this.plans = config.plans;
    this.trialPlanName = config.trialPlanName;
    this.trialRequiresPaymentMethod = config.trialRequiresPaymentMethod;
    this.defaultCurrency = config.defaultCurrency;
    this.seatBilling = config.seatBilling;
    this.nonBillableRoleKeys = config.nonBillableRoleKeys;
    if (!this.defaultCurrency) {
      throw new Error("Billing catalog requires defaultCurrency");
    }
    for (const plan of this.plans) {
      if (!plan.products[this.defaultCurrency]) {
        throw new Error(`Plan ${plan.name} is missing Product for defaultCurrency`);
      }
    }
    for (const [currency, name] of Object.entries(this.trialPlanName)) {
      const trialPlan = findTrialPlan({
        plans: this.plans,
        trialPlanName: this.trialPlanName,
        currency,
      });
      if (!trialPlan) {
        throw new Error(`Trial Plan ${name} not found`);
      }
      const product = trialPlan.products[currency];
      if (!product) {
        throw new Error(`Trial Plan ${name} is missing Product for ${currency}`);
      }
      if (!this.trialRequiresPaymentMethod) {
        const defaultPrice = findDefaultTrialPrice({ plan: trialPlan, currency });
        if (!defaultPrice) {
          throw new Error(`Trial Plan ${name} requires a default Price for ${currency}`);
        }
      }
      if (
        this.seatBilling &&
        (trialPlan.freeTrial?.seats == null || trialPlan.freeTrial.seats < 1)
      ) {
        throw new Error("Seat billing Trial requires freeTrial.seats");
      }
    }
  }

  isBillableRole(role: string): boolean {
    if (role === "owner") return true;
    return !this.nonBillableRoleKeys.includes(role);
  }

  trialPlanFor(currency: string): StripePlan | undefined {
    return findTrialPlan({ plans: this.plans, trialPlanName: this.trialPlanName, currency });
  }

  defaultTrialPriceId(currency: string): string | undefined {
    const trialPlan = this.trialPlanFor(currency);
    if (!trialPlan) return undefined;
    return findDefaultTrialPrice({ plan: trialPlan, currency })?.priceId;
  }

  priceBelongsToTrialPlan(priceId: string, currency: string): boolean {
    const trialPlan = this.trialPlanFor(currency);
    if (!trialPlan) return false;
    return trialPlan.products[currency]?.prices.some((price) => price.priceId === priceId) ?? false;
  }

  trialSeatCap(planName: string): number | undefined {
    return this.plans.find((plan) => plan.name === planName)?.freeTrial?.seats;
  }

  getPlanByPriceId(priceId: string): StripePlan | undefined {
    return findPlanByPriceId(this.plans, priceId);
  }

  priceBelongsToCurrency(priceId: string, currency: string): boolean {
    const plan = this.getPlanByPriceId(priceId);
    if (!plan) return false;
    return findPriceCurrency(plan, priceId) === currency;
  }

  getOrganizationByCustomerId(
    customerId: string
  ): ServerResultAsync<InferSelectModel<Schema["organizations"]> | null> {
    return this.throwableQuery(async () => {
      const [organization] = await this.orm
        .select()
        .from(this.schema.organizations)
        .where(eq(this.schema.organizations.stripeCustomerId, customerId))
        .limit(1);
      return organization ?? null;
    });
  }

  getOrganizationById(
    organizationId: string
  ): ServerResultAsync<InferSelectModel<Schema["organizations"]> | null> {
    return this.throwableQuery(async () => {
      const [organization] = await this.orm
        .select()
        .from(this.schema.organizations)
        .where(eq(this.schema.organizations.id, organizationId))
        .limit(1);
      return organization ?? null;
    });
  }

  createCustomer({
    email,
    name,
    organizationId,
    memberId,
  }: {
    email: string;
    name?: string;
    organizationId: string;
    memberId: string;
  }): ServerResultAsync<Stripe.Customer> {
    return this.throwablePromise(() =>
      this.stripe.customers.create({
        email,
        name,
        metadata: {
          organizationId,
          memberId,
        },
      })
    );
  }

  async createTrialSubscription({
    customerId,
    organizationId,
    memberId,
    priceId,
    currency,
  }: {
    customerId: string;
    organizationId: string;
    memberId: string;
    priceId: string;
    currency: string;
  }): ServerResultAsync<Stripe.Subscription> {
    const trialPlan = this.trialPlanFor(currency);
    if (!trialPlan) return this.error("INTERNAL_SERVER_ERROR", "Trial plan not found");
    const quantity = this.seatBilling ? (trialPlan.freeTrial?.seats ?? 1) : 1;
    const stripeSubscription = await this.createSubscription({
      customerId,
      priceId,
      trialDays: trialPlan.freeTrial?.days ?? 7,
      quantity,
      organizationId,
      memberId,
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
    organizationId,
    memberId,
  }: {
    customerId: string;
    priceId: string;
    quantity?: number;
    trialDays?: number;
    organizationId?: string;
    memberId?: string;
  }): ServerResultAsync<Stripe.Subscription> {
    return this.throwablePromise(() =>
      this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity }],
        ...(organizationId || memberId
          ? {
              metadata: {
                ...(organizationId ? { organizationId } : {}),
                ...(memberId ? { memberId } : {}),
              },
            }
          : {}),
        ...(trialDays != null
          ? {
              trial_period_days: trialDays,
              trial_settings: {
                end_behavior: {
                  missing_payment_method: "cancel",
                },
              },
            }
          : {}),
      })
    );
  }

  updateSubscriptionQuantity({
    subscriptionId,
    itemId,
    quantity,
  }: {
    subscriptionId: string;
    itemId: string;
    quantity: number;
  }): ServerResultAsync<Stripe.Subscription> {
    return this.throwablePromise(() =>
      this.stripe.subscriptions.update(subscriptionId, {
        items: [{ id: itemId, quantity }],
        proration_behavior: "create_prorations",
      })
    );
  }

  cancelStripeSubscription(subscriptionId: string): ServerResultAsync<Stripe.Subscription> {
    return this.throwablePromise(() => this.stripe.subscriptions.cancel(subscriptionId));
  }

  async updateOrganizationCustomerId({
    organizationId,
    customerId,
  }: {
    organizationId: string;
    customerId: string;
  }): ServerResultAsync<InferSelectModel<Schema["organizations"]>> {
    const organizationResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.organizations)
        .set({ stripeCustomerId: customerId })
        .where(eq(this.schema.organizations.id, organizationId))
        .returning()
    );
    if (organizationResult.isErr()) return err(organizationResult.error);
    const [organization] = organizationResult.value;
    if (!organization) return this.error("NOT_FOUND", "Organization not found");
    return ok(organization);
  }

  async getLatestSubscription(referenceId: string): ServerResultAsync<BillingSchema | null> {
    const subscriptionsResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.subscriptions)
        .where(eq(this.schema.subscriptions.referenceId, referenceId))
        .orderBy(desc(this.schema.subscriptions.createdAt))
        .limit(1)
    );
    if (subscriptionsResult.isErr()) return err(subscriptionsResult.error);
    return ok(subscriptionsResult.value[0] ?? null);
  }

  async getAccessibleSubscription(referenceId: string): ServerResultAsync<BillingSchema | null> {
    const subscriptionResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.subscriptions)
        .where(
          and(
            eq(this.schema.subscriptions.referenceId, referenceId),
            inArray(this.schema.subscriptions.status, [...ACCESS_STATUSES])
          )
        )
        .orderBy(desc(this.schema.subscriptions.createdAt))
        .limit(1)
    );
    if (subscriptionResult.isErr()) return err(subscriptionResult.error);
    return ok(subscriptionResult.value[0] ?? null);
  }

  async getOpenSubscription(referenceId: string): ServerResultAsync<BillingSchema | null> {
    const subscriptionResult = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.subscriptions)
        .where(
          and(
            eq(this.schema.subscriptions.referenceId, referenceId),
            inArray(this.schema.subscriptions.status, [...OPEN_STATUSES])
          )
        )
        .orderBy(desc(this.schema.subscriptions.createdAt))
        .limit(1)
    );
    if (subscriptionResult.isErr()) return err(subscriptionResult.error);
    return ok(subscriptionResult.value[0] ?? null);
  }

  async findSubscriptionByStripeId(
    stripeSubscriptionId: string
  ): ServerResultAsync<BillingSchema | null> {
    const result = await this.throwableQuery(() =>
      this.orm
        .select()
        .from(this.schema.subscriptions)
        .where(eq(this.schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId))
        .limit(1)
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] ?? null);
  }

  async countBillableMembers(organizationId: string): ServerResultAsync<number> {
    const membersResult = await this.throwableQuery(() =>
      this.orm
        .select({ role: this.schema.members.role })
        .from(this.schema.members)
        .where(
          and(
            eq(this.schema.members.organizationId, organizationId),
            isNull(this.schema.members.deletedAt)
          )
        )
    );
    if (membersResult.isErr()) return err(membersResult.error);
    return ok(membersResult.value.filter((row) => this.isBillableRole(row.role)).length);
  }

  listInvoices(customerId: string): ServerResultAsync<Stripe.Invoice[]> {
    return this.throwablePromise(async () => {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
      });
      return invoices.data;
    });
  }

  createCheckoutSession({
    customerId,
    priceId,
    organizationId,
    memberId,
    quantity,
    trialDays,
    collectPaymentMethod,
  }: {
    customerId: string;
    priceId: string;
    organizationId: string;
    memberId: string;
    quantity: number;
    trialDays?: number;
    collectPaymentMethod?: boolean;
  }): ServerResultAsync<Stripe.Checkout.Session> {
    return this.throwablePromise(() =>
      this.stripe.checkout.sessions.create({
        client_reference_id: organizationId,
        customer: customerId,
        success_url: `${process.env.VITE_SERVER_URL}/stripe/success`,
        cancel_url: `${process.env.VITE_APP_URL}/billing`,
        mode: "subscription",
        ...(collectPaymentMethod ? { payment_method_collection: "always" } : {}),
        metadata: { organizationId, memberId },
        subscription_data: {
          metadata: { organizationId, memberId },
          ...(trialDays != null ? { trial_period_days: trialDays } : {}),
        },
        line_items: [
          {
            price: priceId,
            quantity,
          },
        ],
      })
    );
  }

  createBillingPortalSession(customerId: string): ServerResultAsync<Stripe.BillingPortal.Session> {
    return this.throwablePromise(() =>
      this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.VITE_SERVER_URL}/stripe/success`,
      })
    );
  }

  getStripeCustomer(
    customerId: string
  ): ServerResultAsync<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.throwablePromise(() => this.stripe.customers.retrieve(customerId));
  }

  listStripeSubscriptions(customerId: string): ServerResultAsync<Stripe.Subscription[]> {
    return this.throwablePromise(async () => {
      const result = await this.stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: "all",
        expand: ["data.default_payment_method"],
      });
      return result.data;
    });
  }

  async syncStripeData({
    customerId,
    organizationId,
    memberId,
  }: {
    customerId: string;
    organizationId: string;
    memberId?: string | null;
  }): ServerResultAsync<boolean> {
    const stripeSubscriptionsResult = await this.listStripeSubscriptions(customerId);
    if (stripeSubscriptionsResult.isErr()) return err(stripeSubscriptionsResult.error);

    const [stripeSubscription] = stripeSubscriptionsResult.value;
    if (!stripeSubscription) return this.error("NOT_FOUND", "Subscription not found");

    const [subscriptionItem] = stripeSubscription.items.data;
    if (!subscriptionItem) return this.error("NOT_FOUND", "Subscription item not found");

    const plan = this.getPlanByPriceId(subscriptionItem.price.id);
    if (!plan)
      return this.error("NOT_FOUND", `Plan not found for price ID: ${subscriptionItem.price.id}`);

    const values = {
      stripeCustomerId: customerId,
      referenceId: organizationId,
      ...(memberId ? { memberId } : {}),
      plan: plan.name,
      status: stripeSubscription.status,
      seats: subscriptionItem.quantity || 1,
      periodEnd: new Date(subscriptionItem.current_period_end * 1000),
      periodStart: new Date(subscriptionItem.current_period_start * 1000),
      priceId: subscriptionItem.price.id,
      interval: subscriptionItem.price.recurring?.interval,
      intervalCount: subscriptionItem.price.recurring?.interval_count ?? 1,
      unitAmount: subscriptionItem.price.unit_amount,
      discounts: stripeSubscription.discounts.map((discount) =>
        typeof discount === "string" ? discount : discount.id
      ),
      stripeSubscriptionId: stripeSubscription.id,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      cancelAt: stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000) : null,
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

    const existingByStripeId = await this.findSubscriptionByStripeId(stripeSubscription.id);
    if (existingByStripeId.isErr()) return err(existingByStripeId.error);

    if (existingByStripeId.value) {
      const existing = existingByStripeId.value;
      const updateResult = await this.throwableQuery(() =>
        this.orm
          .update(this.schema.subscriptions)
          .set({
            ...values,
            updatedAt: new Date(),
          })
          .where(eq(this.schema.subscriptions.id, existing.id))
      );
      if (updateResult.isErr()) return err(updateResult.error);

      const captureResult = this.throwable(() =>
        ok(
          posthogCapture({
            distinctId: organizationId,
            event: "stripe.subscription_updated",
            properties: values,
          })
        )
      );
      if (captureResult.isErr()) return err(captureResult.error);
      return ok(false);
    }

    const latest = await this.getLatestSubscription(organizationId);
    if (latest.isErr()) return err(latest.error);

    const latestRow = latest.value;
    if (!latestRow) {
      const insertResult = await this.throwableQuery(() =>
        this.orm.insert(this.schema.subscriptions).values(values)
      );
      if (insertResult.isErr()) return err(insertResult.error);

      const captureResult = this.throwable(() =>
        ok(
          posthogCapture({
            distinctId: organizationId,
            event: "stripe.subscription_created",
            properties: values,
          })
        )
      );
      if (captureResult.isErr()) return err(captureResult.error);
      return ok(true);
    }

    const updateLatest = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.subscriptions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(this.schema.subscriptions.id, latestRow.id))
    );
    if (updateLatest.isErr()) return err(updateLatest.error);
    return ok(false);
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
