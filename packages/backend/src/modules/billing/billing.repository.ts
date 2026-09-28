import type {
  AdminOrganizationBillingRow,
  BillingCoupon,
  BillingSchema,
} from "@m5kdev/commons/modules/billing/billing.schema";
import type {
  ResolvedStripePlans,
  StripeEnvironment,
  StripePlan,
} from "@m5kdev/commons/modules/billing/billing.types";
import {
  findDefaultTrialPrice,
  findPlanByPriceId,
  findPriceCurrency,
  findTrialPlan,
} from "@m5kdev/commons/modules/billing/billing.utils";
import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import type { InferSelectModel } from "drizzle-orm";
import { and, count, desc, eq, inArray, isNull, like, ne } from "drizzle-orm";
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
const OPEN_STATUSES: readonly string[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
];

type OrganizationRow = InferSelectModel<Schema["organizations"]>;
type CustomerIdField = "stripeCustomerId" | "stripeSandboxCustomerId";
type OrganizationBillingListRow = Omit<AdminOrganizationBillingRow, "coupon">;

function couponIdOfDiscount(discount: string | Stripe.Discount): string {
  if (typeof discount === "string") return discount;
  const coupon = discount.source.coupon;
  if (!coupon) return discount.id;
  return typeof coupon === "string" ? coupon : coupon.id;
}

function toBillingCoupon(coupon: Stripe.Coupon): BillingCoupon {
  return {
    id: coupon.id,
    name: coupon.name,
    percentOff: coupon.percent_off,
    amountOff: coupon.amount_off,
    currency: coupon.currency,
    duration: coupon.duration,
    durationInMonths: coupon.duration_in_months,
    valid: coupon.valid,
  };
}

export class BillingRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["subscriptions"]
> {
  public stripe: Stripe;
  public environment: StripeEnvironment;
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
    this.environment = config.environment;
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

  private get customerIdField(): CustomerIdField {
    return this.environment === "production" ? "stripeCustomerId" : "stripeSandboxCustomerId";
  }

  customerIdOf(organization: Pick<OrganizationRow, CustomerIdField>): string | null {
    return organization[this.customerIdField];
  }

  async getOrganizationCustomerId(organizationId: string): ServerResultAsync<string | null> {
    const organization = await this.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    return ok(organization.value ? this.customerIdOf(organization.value) : null);
  }

  getOrganizationByCustomerId(customerId: string): ServerResultAsync<OrganizationRow | null> {
    return this.throwableQuery(async () => {
      const [organization] = await this.orm
        .select()
        .from(this.schema.organizations)
        .where(eq(this.schema.organizations[this.customerIdField], customerId))
        .limit(1);
      return organization ?? null;
    });
  }

  getOrganizationById(organizationId: string): ServerResultAsync<OrganizationRow | null> {
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
    discounts,
  }: {
    customerId: string;
    priceId: string;
    quantity?: number;
    trialDays?: number;
    organizationId?: string;
    memberId?: string;
    discounts?: Stripe.SubscriptionCreateParams.Discount[];
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
        ...(discounts ? { discounts } : {}),
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
  }): ServerResultAsync<OrganizationRow> {
    const organizationResult = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.organizations)
        .set({ [this.customerIdField]: customerId })
        .where(eq(this.schema.organizations.id, organizationId))
        .returning()
    );
    if (organizationResult.isErr()) return err(organizationResult.error);
    const [organization] = organizationResult.value;
    if (!organization) return this.error("NOT_FOUND", "Organization not found");
    return ok(organization);
  }

  async setOrganizationCurrencyIfUnset({
    organizationId,
    currency,
  }: {
    organizationId: string;
    currency: string;
  }): ServerResultAsync<boolean> {
    const updated = await this.throwableQuery(() =>
      this.orm
        .update(this.schema.organizations)
        .set({ currency })
        .where(
          and(
            eq(this.schema.organizations.id, organizationId),
            isNull(this.schema.organizations.currency)
          )
        )
        .returning({ id: this.schema.organizations.id })
    );
    if (updated.isErr()) return err(updated.error);
    return ok(updated.value.length > 0);
  }

  listOtherOwnedCurrencies({
    userId,
    organizationId,
  }: {
    userId: string;
    organizationId: string;
  }): ServerResultAsync<(string | null)[]> {
    return this.throwableQuery(async () => {
      const rows = await this.orm
        .select({ currency: this.schema.organizations.currency })
        .from(this.schema.members)
        .innerJoin(
          this.schema.organizations,
          eq(this.schema.members.organizationId, this.schema.organizations.id)
        )
        .where(
          and(
            eq(this.schema.members.userId, userId),
            eq(this.schema.members.role, "owner"),
            isNull(this.schema.members.deletedAt),
            ne(this.schema.organizations.id, organizationId)
          )
        );
      return rows.map((row) => row.currency);
    });
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

  getOwnerMember(
    organizationId: string
  ): ServerResultAsync<InferSelectModel<Schema["members"]> | null> {
    return this.throwableQuery(async () => {
      const [owner] = await this.orm
        .select()
        .from(this.schema.members)
        .where(
          and(
            eq(this.schema.members.organizationId, organizationId),
            eq(this.schema.members.role, "owner"),
            isNull(this.schema.members.deletedAt)
          )
        )
        .limit(1);
      return owner ?? null;
    });
  }

  listCoupons(): ServerResultAsync<BillingCoupon[]> {
    return this.throwablePromise(async () => {
      const coupons = await this.stripe.coupons.list({ limit: 100 }).autoPagingToArray({
        limit: 10_000,
      });
      return coupons.map(toBillingCoupon);
    });
  }

  updateSubscriptionDiscounts({
    subscriptionId,
    discounts,
  }: {
    subscriptionId: string;
    discounts: Stripe.SubscriptionUpdateParams.Discount[] | "";
  }): ServerResultAsync<Stripe.Subscription> {
    return this.throwablePromise(() =>
      this.stripe.subscriptions.update(subscriptionId, { discounts })
    );
  }

  updateSubscriptionCancelAtPeriodEnd({
    subscriptionId,
    cancelAtPeriodEnd,
  }: {
    subscriptionId: string;
    cancelAtPeriodEnd: boolean;
  }): ServerResultAsync<Stripe.Subscription> {
    return this.throwablePromise(() =>
      this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd,
      })
    );
  }

  async listOrganizationBilling(query?: QueryInput): ServerResultAsync<{
    rows: OrganizationBillingListRow[];
    total: number;
  }> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const q = query?.q?.trim();

    const listed = await this.throwableQuery(async () => {
      const where = q ? like(this.schema.organizations.name, `%${q}%`) : undefined;
      const [{ count: total } = { count: 0 }] = await this.orm
        .select({ count: count() })
        .from(this.schema.organizations)
        .where(where);
      const organizations = await this.orm
        .select({
          id: this.schema.organizations.id,
          name: this.schema.organizations.name,
          currency: this.schema.organizations.currency,
          stripeCustomerId: this.schema.organizations.stripeCustomerId,
          stripeSandboxCustomerId: this.schema.organizations.stripeSandboxCustomerId,
        })
        .from(this.schema.organizations)
        .where(where)
        .orderBy(desc(this.schema.organizations.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);
      return { organizations, total };
    });
    if (listed.isErr()) return err(listed.error);

    const rows: OrganizationBillingListRow[] = [];
    for (const organization of listed.value.organizations) {
      const subscription = await this.getLatestSubscription(organization.id);
      if (subscription.isErr()) return err(subscription.error);
      rows.push({
        id: organization.id,
        organizationId: organization.id,
        organizationName: organization.name,
        currency: organization.currency ?? null,
        stripeCustomerId: this.customerIdOf(organization),
        openSubscription: Boolean(
          subscription.value && OPEN_STATUSES.includes(subscription.value.status)
        ),
        subscription: subscription.value,
      });
    }
    return ok({ rows, total: listed.value.total });
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
        expand: ["data.default_payment_method", "data.discounts"],
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
      discounts: stripeSubscription.discounts.map(couponIdOfDiscount),
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
