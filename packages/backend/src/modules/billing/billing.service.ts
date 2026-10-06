import {
  type ActiveSubscription,
  applyAdminCouponInputSchema,
  type BillingCoupon,
  type BillingSchema,
  billingAdminListInputSchema,
  billingAdminListOutputSchema,
  billingCouponListOutputSchema,
  type CreateAdminSubscriptionInput,
  cancelAdminSubscriptionInputSchema,
  createAdminSubscriptionInputSchema,
  organizationIdInputSchema,
  setAdminAllowCardlessTrialInputSchema,
  setAdminBillingExemptInputSchema,
  setOrganizationCurrencyInputSchema,
} from "@m5kdev/commons/modules/billing/billing.schema";
import {
  catalogCurrencyKeys,
  findDefaultTrialPrice,
  findPriceCurrency,
  resolveTrialDays,
} from "@m5kdev/commons/modules/billing/billing.utils";
import type { InferSelectModel } from "drizzle-orm";
import { err, ok } from "neverthrow";
import type Stripe from "stripe";
import { posthogCapture } from "../../utils/posthog";
import type { Context } from "../../utils/trpc";
import type * as authTables from "../auth/auth.db";
import { resolveOrganizationCurrency } from "../auth/auth.utils";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BasePermissionService } from "../base/base.service";
import type { EmailService } from "../email/email.service";
import type { BillingRepository } from "./billing.repository";

const TRIAL_ENDING_TEMPLATE_KEY = "trialEnding";
const TRIAL_PRICE_ID_METADATA_KEY = "trialPriceId";
const TRIAL_START_FALLBACK_DAYS = 7;
const NO_PAYMENT_METHOD_MESSAGE =
  "The Customer has no payment method: pick a Trial or a 100% Coupon";
const CARDLESS_TRIAL_CARD_ON_ONLY_MESSAGE =
  "allowCardlessTrial is only when Trial requires a payment method";
const CARDLESS_TRIAL_CONSUMED_MESSAGE =
  "This Organization already used a cardless Trial in this Stripe environment";
const CARDLESS_TRIAL_NO_DAYS_MESSAGE = "Trial has no days for this Organization";

type OwnerMember = InferSelectModel<typeof authTables.members> & { email: string };

function couponOfSubscription({
  subscription,
  coupons,
}: {
  subscription: BillingSchema | null;
  coupons: readonly BillingCoupon[];
}): BillingCoupon | null {
  const couponId = subscription?.discounts?.[0];
  if (!couponId) return null;
  return (
    coupons.find((coupon) => coupon.id === couponId) ?? {
      id: couponId,
      name: null,
      percentOff: null,
      amountOff: null,
      currency: null,
      duration: null,
      durationInMonths: null,
      valid: false,
    }
  );
}

const allowedEvents: Stripe.Event.Type[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "invoice.marked_uncollectible",
  "invoice.payment_succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
];

export class BillingService extends BasePermissionService<
  { billing: BillingRepository },
  { email: EmailService }
> {
  private readonly processedTrialWillEndEventIds = new Set<string>();

  async createOrganizationCustomer({
    organizationId,
    memberId,
    email,
    name,
    metadata,
  }: {
    organizationId: string;
    memberId: string;
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): ServerResultAsync<Stripe.Customer> {
    const existingCustomerId =
      await this.repository.billing.getOrganizationCustomerId(organizationId);
    if (existingCustomerId.isErr()) return err(existingCustomerId.error);
    if (existingCustomerId.value) {
      const customer = await this.repository.billing.getStripeCustomer(existingCustomerId.value);
      if (customer.isErr()) return err(customer.error);
      if (!customer.value.deleted) return ok(customer.value);
    }

    const created = await this.repository.billing.createCustomer({
      email,
      name,
      organizationId,
      memberId,
      metadata,
    });
    if (created.isErr()) return err(created.error);

    const updated = await this.repository.billing.updateOrganizationCustomerId({
      organizationId,
      customerId: created.value.id,
    });
    if (updated.isErr()) return err(updated.error);
    return ok(created.value);
  }

  catalogCurrencies(): { defaultCurrency: string; currencies: string[] } {
    return {
      defaultCurrency: this.repository.billing.defaultCurrency,
      currencies: catalogCurrencyKeys(this.repository.billing.plans),
    };
  }

  trialPriceCurrency(priceId: string): string | undefined {
    const plan = this.repository.billing.getPlanByPriceId(priceId);
    const currency = plan ? findPriceCurrency(plan, priceId) : undefined;
    if (!currency || !this.repository.billing.priceBelongsToTrialPlan(priceId, currency)) {
      return undefined;
    }
    return currency;
  }

  async createOrganizationHook({
    organizationId,
    memberId,
    email,
    name,
    trialPriceId: requestedTrialPriceId,
  }: {
    organizationId: string;
    memberId: string;
    email: string;
    name?: string;
    trialPriceId?: string | null;
  }): ServerResultAsync<boolean> {
    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return ok(false);
    const currency = organization.value?.currency ?? this.repository.billing.defaultCurrency;

    let pickedTrialPriceId: string | undefined;
    if (requestedTrialPriceId) {
      if (this.repository.billing.priceBelongsToTrialPlan(requestedTrialPriceId, currency)) {
        pickedTrialPriceId = requestedTrialPriceId;
      } else {
        this.logger.info(
          { organizationId, currency, trialPriceId: requestedTrialPriceId },
          "Ignoring a sign-up Price that is not on the Trial Plan for Organization currency"
        );
      }
    }

    const stripeCustomer = await this.createOrganizationCustomer({
      organizationId,
      memberId,
      email,
      name,
      metadata: pickedTrialPriceId
        ? { [TRIAL_PRICE_ID_METADATA_KEY]: pickedTrialPriceId }
        : undefined,
    });
    if (stripeCustomer.isErr()) {
      this.logger.warn(
        { err: stripeCustomer.error, organizationId },
        "Stripe Customer create failed; Organization remains without a Subscription"
      );
      return ok(false);
    }

    if (!this.repository.billing.trialRequiresPaymentMethod) {
      const trialPlan = this.repository.billing.trialPlanFor(currency);
      const trialPriceId =
        pickedTrialPriceId ?? this.repository.billing.defaultTrialPriceId(currency);
      if (trialPlan && !trialPriceId) return ok(false);

      if (trialPlan && trialPriceId) {
        const trialDays = resolveTrialDays({
          plan: trialPlan,
          priceId: trialPriceId,
          fallbackDays: TRIAL_START_FALLBACK_DAYS,
        });
        if (trialDays != null) {
          const existingSubscription =
            await this.repository.billing.getLatestSubscription(organizationId);
          if (existingSubscription.isErr()) return ok(false);
          if (!existingSubscription.value) {
            const subscription = await this.repository.billing.createTrialSubscription({
              customerId: stripeCustomer.value.id,
              organizationId,
              memberId,
              priceId: trialPriceId,
              currency,
              trialDays,
            });
            if (subscription.isErr()) {
              this.logger.warn(
                { err: subscription.error, organizationId },
                "Stripe Trial create failed; Organization remains without a Subscription"
              );
              return ok(false);
            }
          }
          const syncResult = await this.syncStripeData({
            customerId: stripeCustomer.value.id,
            memberId,
          });
          if (syncResult.isErr()) return ok(false);
        }
      }
    }

    return ok(true);
  }

  async getActiveSubscription(ctx: Context): ServerResultAsync<ActiveSubscription | null> {
    const organizationId = ctx.actor.organizationId;
    if (!organizationId) return this.error("FORBIDDEN", "Organization is required");

    const readGuard = this.accessGuard(ctx.actor, "read", { organizationId });
    if (readGuard.isErr()) return err(readGuard.error);

    const subscription = await this.repository.billing.getAccessibleSubscription(organizationId);
    if (subscription.isErr()) return err(subscription.error);
    if (!subscription.value) return ok(null);

    const ownerMustAddPaymentMethod = await this.ownerMustAddPaymentMethod({
      organizationId,
      organizationRole: ctx.actor.organizationRole,
      subscription: subscription.value,
    });
    if (ownerMustAddPaymentMethod.isErr()) return err(ownerMustAddPaymentMethod.error);
    return ok({
      ...subscription.value,
      ownerMustAddPaymentMethod: ownerMustAddPaymentMethod.value,
    });
  }

  async getTrialPriceId(ctx: Context): ServerResultAsync<string | null> {
    const organizationId = ctx.actor.organizationId;
    if (!organizationId) return this.error("FORBIDDEN", "Organization is required");

    const readGuard = this.accessGuard(ctx.actor, "read", { organizationId });
    if (readGuard.isErr()) return err(readGuard.error);

    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");
    const customerId = this.repository.billing.customerIdOf(organization.value);
    if (!customerId) return ok(null);

    const customer = await this.repository.billing.getStripeCustomer(customerId);
    if (customer.isErr()) return err(customer.error);
    if (customer.value.deleted) return ok(null);
    const currency = organization.value.currency ?? this.repository.billing.defaultCurrency;
    return ok(this.pickedTrialPriceId({ customer: customer.value, currency }) ?? null);
  }

  async listInvoices(ctx: Context): ServerResultAsync<Stripe.Invoice[]> {
    const organizationId = ctx.actor.organizationId;
    if (!organizationId) return this.error("FORBIDDEN", "Organization is required");

    const readGuard = this.accessGuard(ctx.actor, "read", { organizationId });
    if (readGuard.isErr()) return err(readGuard.error);

    const customerId = await this.repository.billing.getOrganizationCustomerId(organizationId);
    if (customerId.isErr()) return err(customerId.error);
    if (!customerId.value) {
      return this.error("INTERNAL_SERVER_ERROR", "Organization has no stripe customer id");
    }
    return this.repository.billing.listInvoices(customerId.value);
  }

  async createCheckoutSession(
    { priceId }: { priceId: string },
    {
      organizationId,
      memberId,
      organizationRole,
      email,
      name,
    }: {
      organizationId: string;
      memberId: string;
      organizationRole: string;
      email: string;
      name?: string;
    }
  ): ServerResultAsync<Stripe.Checkout.Session> {
    if (organizationRole !== "owner") return this.error("FORBIDDEN", "Only the Owner can checkout");

    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    const currency = organization.value?.currency ?? this.repository.billing.defaultCurrency;
    const trialPlan = this.repository.billing.trialPlanFor(currency);
    let checkoutPriceId = priceId;
    let trialDays: number | undefined;
    let collectPaymentMethod = false;
    let usePickedTrialPrice = false;

    if (this.repository.billing.trialRequiresPaymentMethod && trialPlan) {
      const defaultPriceId = this.repository.billing.defaultTrialPriceId(currency);
      if (defaultPriceId) {
        checkoutPriceId = defaultPriceId;
        usePickedTrialPrice = true;
      } else if (!this.repository.billing.priceBelongsToTrialPlan(priceId, currency)) {
        return this.error("NOT_FOUND", "Price not found for this Trial Plan");
      }
      collectPaymentMethod = true;
    }

    if (!this.repository.billing.priceBelongsToCurrency(checkoutPriceId, currency)) {
      return this.error("NOT_FOUND", "Price not found for Organization currency");
    }

    const open = await this.repository.billing.getOpenSubscription(organizationId);
    if (open.isErr()) return err(open.error);
    if (open.value) {
      return this.error("CONFLICT", "Organization already has a Subscription");
    }

    const stripeCustomer = await this.createOrganizationCustomer({
      organizationId,
      memberId,
      email,
      name,
    });
    if (stripeCustomer.isErr()) return err(stripeCustomer.error);
    if (usePickedTrialPrice) {
      checkoutPriceId =
        this.pickedTrialPriceId({ customer: stripeCustomer.value, currency }) ?? checkoutPriceId;
    }

    if (collectPaymentMethod && trialPlan) {
      trialDays = resolveTrialDays({
        plan: trialPlan,
        priceId: checkoutPriceId,
        fallbackDays: TRIAL_START_FALLBACK_DAYS,
      });
    }

    const stripeSubscriptions = await this.repository.billing.listStripeSubscriptions(
      stripeCustomer.value.id
    );
    if (stripeSubscriptions.isErr()) return err(stripeSubscriptions.error);
    const openOnStripe = stripeSubscriptions.value.some((subscription) =>
      ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(
        subscription.status
      )
    );
    if (openOnStripe) {
      return this.error("CONFLICT", "Organization already has a Subscription");
    }

    let quantity = 1;
    if (this.repository.billing.seatBilling) {
      const count = await this.repository.billing.countBillableMembers(organizationId);
      if (count.isErr()) return err(count.error);
      quantity = Math.max(count.value, 1);
    }

    return this.repository.billing.createCheckoutSession({
      customerId: stripeCustomer.value.id,
      priceId: checkoutPriceId,
      organizationId,
      memberId,
      quantity,
      trialDays,
      collectPaymentMethod,
    });
  }

  async createBillingPortalSession({
    organizationId,
    memberId,
    organizationRole,
    email,
    name,
  }: {
    organizationId: string;
    memberId: string;
    organizationRole: string;
    email: string;
    name?: string;
  }): ServerResultAsync<Stripe.BillingPortal.Session> {
    if (organizationRole !== "owner") {
      return this.error("FORBIDDEN", "Only the Owner can open the Billing Portal");
    }

    const stripeCustomer = await this.createOrganizationCustomer({
      organizationId,
      memberId,
      email,
      name,
    });
    if (stripeCustomer.isErr()) return err(stripeCustomer.error);
    return this.repository.billing.createBillingPortalSession(stripeCustomer.value.id);
  }

  async adjustBillableSeats({
    organizationId,
    role,
    delta,
  }: {
    organizationId: string;
    role: string;
    delta: 1 | -1;
  }): ServerResultAsync<boolean> {
    if (!this.repository.billing.seatBilling) return ok(false);
    if (!this.repository.billing.isBillableRole(role)) return ok(false);

    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (organization.value?.billingExempt) return ok(false);

    const subscription = await this.repository.billing.getAccessibleSubscription(organizationId);
    if (subscription.isErr()) return err(subscription.error);
    if (!subscription.value?.stripeSubscriptionId) {
      return ok(false);
    }

    if (delta > 0 && subscription.value.status === "past_due") {
      return this.error("FORBIDDEN", "Cannot add billed Memberships while past_due");
    }

    const current = await this.repository.billing.countBillableMembers(organizationId);
    if (current.isErr()) return err(current.error);
    const target = current.value + delta;

    if (subscription.value.status === "trialing") {
      if (delta > 0) {
        const cap = this.repository.billing.trialSeatCap(subscription.value.plan);
        if (cap != null && target > cap) {
          return this.error("FORBIDDEN", "Trial seat cap reached");
        }
      }
      return ok(true);
    }

    const stripeSubscriptions = await this.repository.billing.listStripeSubscriptions(
      subscription.value.stripeCustomerId ?? ""
    );
    if (stripeSubscriptions.isErr()) return err(stripeSubscriptions.error);
    const [stripeSubscription] = stripeSubscriptions.value;
    const item = stripeSubscription?.items.data[0];
    if (!stripeSubscription || !item) {
      return this.error("NOT_FOUND", "Subscription item not found");
    }

    const updated = await this.repository.billing.updateSubscriptionQuantity({
      subscriptionId: stripeSubscription.id,
      itemId: item.id,
      quantity: Math.max(target, 1),
    });
    if (updated.isErr()) return err(updated.error);

    const synced = await this.syncStripeData({
      customerId: subscription.value.stripeCustomerId ?? "",
    });
    if (synced.isErr()) return err(synced.error);
    return ok(true);
  }

  async adjustBillableSeatsForRoleChange({
    organizationId,
    fromRole,
    toRole,
  }: {
    organizationId: string;
    fromRole: string;
    toRole: string;
  }): ServerResultAsync<boolean> {
    if (!this.repository.billing.seatBilling) return ok(false);
    const fromBillable = this.repository.billing.isBillableRole(fromRole);
    const toBillable = this.repository.billing.isBillableRole(toRole);
    if (fromBillable === toBillable) return ok(false);
    return this.adjustBillableSeats({
      organizationId,
      role: toBillable ? toRole : fromRole,
      delta: toBillable ? 1 : -1,
    });
  }

  async cancelOrganizationSubscription({
    organizationId,
  }: {
    organizationId: string;
  }): ServerResultAsync<boolean> {
    const latest = await this.repository.billing.getLatestSubscription(organizationId);
    if (latest.isErr()) return err(latest.error);
    if (!latest.value?.stripeSubscriptionId) return ok(false);
    if (latest.value.status === "canceled") return ok(false);

    const canceled = await this.repository.billing.cancelStripeSubscription(
      latest.value.stripeSubscriptionId
    );
    if (canceled.isErr()) return err(canceled.error);
    if (latest.value.stripeCustomerId) {
      const synced = await this.syncStripeData({ customerId: latest.value.stripeCustomerId });
      if (synced.isErr()) return err(synced.error);
    }
    return ok(true);
  }

  listAdminOrganizationBilling = this.procedure("listAdminOrganizationBilling")
    .input(billingAdminListInputSchema)
    .output(billingAdminListOutputSchema)
    .requireAuth("admin")
    .access({ action: "read" })
    .handle(async ({ input }) => {
      const listed = await this.repository.billing.listOrganizationBilling(input);
      if (listed.isErr()) return err(listed.error);
      const hasCoupons = listed.value.rows.some(
        (row) => (row.subscription?.discounts?.length ?? 0) > 0
      );
      let coupons: BillingCoupon[] = [];
      if (hasCoupons) {
        const listedCoupons = await this.repository.billing.listCoupons();
        if (listedCoupons.isErr()) return err(listedCoupons.error);
        coupons = listedCoupons.value;
      }
      return ok({
        environment: this.repository.billing.environment,
        total: listed.value.total,
        rows: listed.value.rows.map((row) => ({
          ...row,
          defaultTrialDays: this.defaultTrialDaysFor(row.currency),
          coupon: couponOfSubscription({ subscription: row.subscription, coupons }),
        })),
      });
    });

  listAdminCoupons = this.procedure("listAdminCoupons")
    .output(billingCouponListOutputSchema)
    .requireAuth("admin")
    .access({ action: "read" })
    .handle(async () => {
      const coupons = await this.repository.billing.listCoupons();
      if (coupons.isErr()) return err(coupons.error);
      return ok(coupons.value.filter((coupon) => coupon.valid));
    });

  createAdminCustomer = this.procedure("createAdminCustomer")
    .input(organizationIdInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      const owner = await this.requireOwner(input.organizationId);
      if (owner.isErr()) return err(owner.error);
      const customer = await this.createOrganizationCustomer({
        organizationId: input.organizationId,
        memberId: owner.value.id,
        email: owner.value.email,
        name: owner.value.name || undefined,
      });
      if (customer.isErr()) return err(customer.error);
      return ok(true);
    });

  setAdminOrganizationCurrency = this.procedure("setAdminOrganizationCurrency")
    .input(setOrganizationCurrencyInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      return this.setOrganizationCurrency(input);
    });

  setAdminBillingExempt = this.procedure("setAdminBillingExempt")
    .input(setAdminBillingExemptInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      const organization = await this.repository.billing.getOrganizationById(input.organizationId);
      if (organization.isErr()) return err(organization.error);
      if (!organization.value) return this.error("NOT_FOUND", "Organization not found");
      return this.repository.billing.setBillingExempt(input);
    });

  setAdminAllowCardlessTrial = this.procedure("setAdminAllowCardlessTrial")
    .input(setAdminAllowCardlessTrialInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      return this.setAllowCardlessTrialForOrganization(input);
    });

  createAdminSubscription = this.procedure("createAdminSubscription")
    .input(createAdminSubscriptionInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      return this.createSubscriptionForOrganization(input);
    });

  applyAdminCoupon = this.procedure("applyAdminCoupon")
    .input(applyAdminCouponInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      return this.setSubscriptionCoupon(input);
    });

  removeAdminCoupon = this.procedure("removeAdminCoupon")
    .input(organizationIdInputSchema)
    .requireAuth("admin")
    .access({ action: "write" })
    .handle(async ({ input }) => {
      return this.setSubscriptionCoupon({ organizationId: input.organizationId, couponId: null });
    });

  cancelAdminSubscription = this.procedure("cancelAdminSubscription")
    .input(cancelAdminSubscriptionInputSchema)
    .requireAuth("admin")
    .access({ action: "delete" })
    .handle(async ({ input }) => {
      return this.cancelAdminSubscriptionForOrganization(input);
    });

  async syncOrganizationSubscription(organizationId: string): ServerResultAsync<boolean> {
    const customerId = await this.repository.billing.getOrganizationCustomerId(organizationId);
    if (customerId.isErr()) return err(customerId.error);
    if (!customerId.value) {
      return this.error("NOT_FOUND", "Organization has no stripe customer id");
    }
    return this.syncStripeData({ customerId: customerId.value });
  }

  constructEvent(body: Buffer | string, signature: string): ServerResult<Stripe.Event> {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      return this.error("INTERNAL_SERVER_ERROR", "Stripe webhook secret is not set");
    return this.repository.billing.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }

  async syncStripeData({
    customerId,
    eventType,
    memberId,
  }: {
    customerId: string;
    eventType?: string;
    memberId?: string;
  }): ServerResultAsync<boolean> {
    const organization = await this.repository.billing.getOrganizationByCustomerId(customerId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");

    if (eventType) {
      posthogCapture({
        distinctId: organization.value.id,
        event: `stripe.${eventType}`,
        properties: {
          customerId,
        },
      });
    }
    return this.repository.billing.syncStripeData({
      customerId,
      organizationId: organization.value.id,
      memberId,
    });
  }

  async processEvent(event: Stripe.Event): ServerResultAsync<boolean> {
    if (!allowedEvents.includes(event.type)) return ok(false);

    const { customer: customerId } = event.data.object as {
      customer: string;
    };

    if (typeof customerId !== "string") {
      return this.error(
        "INTERNAL_SERVER_ERROR",
        `[STRIPE HOOK] Unexpected event structure: customer ID is not a string. Event type: ${event.type}`
      );
    }

    const result = await this.syncStripeData({ customerId, eventType: event.type });
    if (result.isErr()) return err(result.error);

    if (event.type === "customer.subscription.trial_will_end") {
      const trialEnding = await this.sendTrialEndingWarning({
        customerId,
        eventId: event.id,
        subscription: event.data.object as Stripe.Subscription,
      });
      if (trialEnding.isErr()) return err(trialEnding.error);
    }

    if (event.type === "customer.subscription.updated") {
      const data = event.data as Stripe.CustomerSubscriptionUpdatedEvent.Data;
      const snapped = await this.snapQuantityAfterTrialConvert(data);
      if (snapped.isErr()) return err(snapped.error);
    }

    return ok(true);
  }

  private async requireOwner(organizationId: string): ServerResultAsync<OwnerMember> {
    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");

    const owner = await this.repository.billing.getOwnerMember(organizationId);
    if (owner.isErr()) return err(owner.error);
    if (!owner.value?.email) return this.error("NOT_FOUND", "Organization Owner not found");
    return ok({ ...owner.value, email: owner.value.email });
  }

  private async setAllowCardlessTrialForOrganization({
    organizationId,
    allowCardlessTrial,
  }: {
    organizationId: string;
    allowCardlessTrial: boolean;
  }): ServerResultAsync<boolean> {
    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");

    if (!allowCardlessTrial) {
      return this.repository.billing.setAllowCardlessTrial({
        organizationId,
        allowCardlessTrial: false,
      });
    }

    if (!this.repository.billing.trialRequiresPaymentMethod) {
      return this.error("BAD_REQUEST", CARDLESS_TRIAL_CARD_ON_ONLY_MESSAGE);
    }

    const open = await this.repository.billing.getOpenSubscription(organizationId);
    if (open.isErr()) return err(open.error);
    if (open.value) {
      return this.repository.billing.setAllowCardlessTrial({
        organizationId,
        allowCardlessTrial: true,
      });
    }

    if (organization.value.cardlessTrialConsumed?.[this.repository.billing.environment]) {
      return this.error("CONFLICT", CARDLESS_TRIAL_CONSUMED_MESSAGE);
    }

    const owner = await this.requireOwner(organizationId);
    if (owner.isErr()) return err(owner.error);

    const currency = organization.value.currency ?? this.repository.billing.defaultCurrency;
    const stripeCustomer = await this.createOrganizationCustomer({
      organizationId,
      memberId: owner.value.id,
      email: owner.value.email,
      name: owner.value.name || undefined,
    });
    if (stripeCustomer.isErr()) return err(stripeCustomer.error);

    const started = await this.startCardlessTrial({
      organizationId,
      memberId: owner.value.id,
      customerId: stripeCustomer.value.id,
      currency,
      customer: stripeCustomer.value,
    });
    if (started.isErr()) return err(started.error);
    if (!started.value) return this.error("BAD_REQUEST", CARDLESS_TRIAL_NO_DAYS_MESSAGE);

    const consumed = await this.repository.billing.markCardlessTrialConsumed(organizationId);
    if (consumed.isErr()) return err(consumed.error);
    return this.repository.billing.setAllowCardlessTrial({
      organizationId,
      allowCardlessTrial: true,
    });
  }

  private async startCardlessTrial({
    organizationId,
    memberId,
    customerId,
    currency,
    customer,
  }: {
    organizationId: string;
    memberId: string;
    customerId: string;
    currency: string;
    customer: Stripe.Customer;
  }): ServerResultAsync<boolean> {
    const trialPlan = this.repository.billing.trialPlanFor(currency);
    const trialPriceId =
      this.pickedTrialPriceId({ customer, currency }) ??
      this.repository.billing.defaultTrialPriceId(currency);
    if (!trialPlan || !trialPriceId) return ok(false);

    const trialDays = resolveTrialDays({
      plan: trialPlan,
      priceId: trialPriceId,
      fallbackDays: TRIAL_START_FALLBACK_DAYS,
    });
    if (trialDays == null) return ok(false);

    const subscription = await this.repository.billing.createTrialSubscription({
      customerId,
      organizationId,
      memberId,
      priceId: trialPriceId,
      currency,
      trialDays,
    });
    if (subscription.isErr()) return err(subscription.error);

    const syncResult = await this.syncStripeData({
      customerId,
      memberId,
    });
    if (syncResult.isErr()) return err(syncResult.error);
    return ok(true);
  }

  private async ownerMustAddPaymentMethod({
    organizationId,
    organizationRole,
    subscription,
  }: {
    organizationId: string;
    organizationRole: string | null;
    subscription: BillingSchema;
  }): ServerResultAsync<boolean> {
    if (organizationRole !== "owner" || subscription.status !== "trialing") return ok(false);

    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value || organization.value.allowCardlessTrial) return ok(false);

    const customerId = this.repository.billing.customerIdOf(organization.value);
    if (!customerId) return ok(true);

    const customer = await this.repository.billing.getStripeCustomer(customerId);
    if (customer.isErr()) return err(customer.error);
    if (customer.value.deleted) return ok(true);
    return ok(
      !this.defaultPaymentMethodId(customer.value.invoice_settings?.default_payment_method)
    );
  }

  private async setOrganizationCurrency({
    organizationId,
    currency,
  }: {
    organizationId: string;
    currency: string;
  }): ServerResultAsync<boolean> {
    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");
    if (organization.value.currency) {
      return this.error("CONFLICT", "Organization currency is already set");
    }

    const owner = await this.repository.billing.getOwnerMember(organizationId);
    if (owner.isErr()) return err(owner.error);
    let ownedCurrencies: (string | null)[] = [];
    if (owner.value?.userId) {
      const owned = await this.repository.billing.listOtherOwnedCurrencies({
        userId: owner.value.userId,
        organizationId,
      });
      if (owned.isErr()) return err(owned.error);
      ownedCurrencies = owned.value;
    }

    const resolved = resolveOrganizationCurrency({
      requested: currency,
      ownedCurrencies,
      defaultCurrency: this.repository.billing.defaultCurrency,
      allowedCurrencies: catalogCurrencyKeys(this.repository.billing.plans),
    });
    if (!resolved.ok) {
      return this.error(
        "BAD_REQUEST",
        resolved.reason === "mismatch"
          ? "Organization currency does not match owned Organizations"
          : "Unknown organization currency"
      );
    }

    const updated = await this.repository.billing.setOrganizationCurrencyIfUnset({
      organizationId,
      currency: resolved.currency,
    });
    if (updated.isErr()) return err(updated.error);
    if (!updated.value) return this.error("CONFLICT", "Organization currency is already set");
    return ok(true);
  }

  private async createSubscriptionForOrganization({
    organizationId,
    priceId,
    couponId,
    trialDays,
  }: CreateAdminSubscriptionInput): ServerResultAsync<boolean> {
    if (trialDays && couponId) {
      return this.error("BAD_REQUEST", "Pick either a Trial or a Coupon, not both");
    }
    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");
    const currency = organization.value.currency;
    if (!currency) {
      return this.error("BAD_REQUEST", "Set Organization currency before picking a Price");
    }
    if (!this.repository.billing.priceBelongsToCurrency(priceId, currency)) {
      return this.error("NOT_FOUND", "Price not found for Organization currency");
    }

    const open = await this.repository.billing.getOpenSubscription(organizationId);
    if (open.isErr()) return err(open.error);
    if (open.value) return this.error("CONFLICT", "Organization already has a Subscription");

    let fullyDiscounted = false;
    if (couponId) {
      const coupon = await this.repository.billing.getCoupon(couponId);
      if (coupon.isErr()) return err(coupon.error);
      if (!coupon.value) return this.error("NOT_FOUND", "Coupon not found");
      fullyDiscounted = coupon.value.percentOff === 100;
    }

    const needsPaymentMethod = !trialDays && !fullyDiscounted;
    if (needsPaymentMethod) {
      const existingCustomerId =
        await this.repository.billing.getOrganizationCustomerId(organizationId);
      if (existingCustomerId.isErr()) return err(existingCustomerId.error);
      if (!existingCustomerId.value) return this.error("BAD_REQUEST", NO_PAYMENT_METHOD_MESSAGE);
    }

    const owner = await this.requireOwner(organizationId);
    if (owner.isErr()) return err(owner.error);

    const stripeCustomer = await this.createOrganizationCustomer({
      organizationId,
      memberId: owner.value.id,
      email: owner.value.email,
      name: owner.value.name || undefined,
    });
    if (stripeCustomer.isErr()) return err(stripeCustomer.error);

    if (
      needsPaymentMethod &&
      !this.defaultPaymentMethodId(stripeCustomer.value.invoice_settings?.default_payment_method)
    ) {
      return this.error("BAD_REQUEST", NO_PAYMENT_METHOD_MESSAGE);
    }

    let quantity = 1;
    if (this.repository.billing.seatBilling) {
      const count = await this.repository.billing.countBillableMembers(organizationId);
      if (count.isErr()) return err(count.error);
      quantity = Math.max(count.value, 1);
    }

    const created = await this.repository.billing.createSubscription({
      customerId: stripeCustomer.value.id,
      priceId,
      quantity,
      organizationId,
      memberId: owner.value.id,
      trialDays,
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
    });
    if (created.isErr()) return err(created.error);

    const synced = await this.syncStripeData({
      customerId: stripeCustomer.value.id,
      memberId: owner.value.id,
    });
    if (synced.isErr()) return err(synced.error);
    return ok(true);
  }

  private async setSubscriptionCoupon({
    organizationId,
    couponId,
  }: {
    organizationId: string;
    couponId: string | null;
  }): ServerResultAsync<boolean> {
    const open = await this.repository.billing.getOpenSubscription(organizationId);
    if (open.isErr()) return err(open.error);
    if (!open.value?.stripeSubscriptionId || !open.value.stripeCustomerId) {
      return this.error("NOT_FOUND", "Subscription not found");
    }

    const updated = await this.repository.billing.updateSubscriptionDiscounts({
      subscriptionId: open.value.stripeSubscriptionId,
      discounts: couponId ? [{ coupon: couponId }] : "",
    });
    if (updated.isErr()) return err(updated.error);

    const synced = await this.syncStripeData({ customerId: open.value.stripeCustomerId });
    if (synced.isErr()) return err(synced.error);
    return ok(true);
  }

  private async cancelAdminSubscriptionForOrganization({
    organizationId,
    when,
  }: {
    organizationId: string;
    when: "immediate" | "period_end";
  }): ServerResultAsync<boolean> {
    const latest = await this.repository.billing.getLatestSubscription(organizationId);
    if (latest.isErr()) return err(latest.error);
    if (!latest.value?.stripeSubscriptionId) {
      return this.error("NOT_FOUND", "Subscription not found");
    }
    if (latest.value.status === "canceled") return ok(false);

    if (when === "period_end") {
      const updated = await this.repository.billing.updateSubscriptionCancelAtPeriodEnd({
        subscriptionId: latest.value.stripeSubscriptionId,
        cancelAtPeriodEnd: true,
      });
      if (updated.isErr()) return err(updated.error);
    } else {
      const canceled = await this.repository.billing.cancelStripeSubscription(
        latest.value.stripeSubscriptionId
      );
      if (canceled.isErr()) return err(canceled.error);
    }

    if (latest.value.stripeCustomerId) {
      const synced = await this.syncStripeData({ customerId: latest.value.stripeCustomerId });
      if (synced.isErr()) return err(synced.error);
    }
    return ok(true);
  }

  private async snapQuantityAfterTrialConvert(
    data: Stripe.CustomerSubscriptionUpdatedEvent.Data
  ): ServerResultAsync<void> {
    if (!this.repository.billing.seatBilling) return ok();
    const previousStatus = (data.previous_attributes as { status?: string } | undefined)?.status;
    const subscription = data.object;
    if (previousStatus !== "trialing" || subscription.status !== "active") return ok();

    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : undefined;
    if (!customerId) return ok();

    const organization = await this.repository.billing.getOrganizationByCustomerId(customerId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return ok();
    if (organization.value.billingExempt) return ok();

    const count = await this.repository.billing.countBillableMembers(organization.value.id);
    if (count.isErr()) return err(count.error);

    const item = subscription.items.data[0];
    if (!item) return ok();

    const updated = await this.repository.billing.updateSubscriptionQuantity({
      subscriptionId: subscription.id,
      itemId: item.id,
      quantity: Math.max(count.value, 1),
    });
    if (updated.isErr()) return err(updated.error);
    const synced = await this.syncStripeData({ customerId });
    if (synced.isErr()) return err(synced.error);
    return ok();
  }

  private defaultTrialDaysFor(currency: string | null): number | null {
    if (!currency) return null;
    const trialPlan = this.repository.billing.trialPlanFor(currency);
    if (!trialPlan) return null;
    return (
      resolveTrialDays({
        plan: trialPlan,
        price: findDefaultTrialPrice({ plan: trialPlan, currency }),
      }) ?? null
    );
  }

  private pickedTrialPriceId({
    customer,
    currency,
  }: {
    customer: Stripe.Customer;
    currency: string;
  }): string | undefined {
    const priceId = customer.metadata?.[TRIAL_PRICE_ID_METADATA_KEY];
    if (!priceId || !this.repository.billing.priceBelongsToTrialPlan(priceId, currency)) {
      return undefined;
    }
    return priceId;
  }

  private defaultPaymentMethodId(
    value: string | Stripe.PaymentMethod | null | undefined
  ): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if ("deleted" in value && value.deleted) return undefined;
    return value.id;
  }

  private async sendTrialEndingWarning({
    customerId,
    eventId,
    subscription,
  }: {
    customerId: string;
    eventId: string;
    subscription: Stripe.Subscription;
  }): ServerResultAsync<void> {
    if (this.processedTrialWillEndEventIds.has(eventId)) return ok();

    const template = this.service.email.templates[TRIAL_ENDING_TEMPLATE_KEY];
    if (!template) {
      this.logger.info(
        { templateKey: TRIAL_ENDING_TEMPLATE_KEY, customerId },
        "Skipping trial-ending email because the template is unregistered"
      );
      return ok();
    }

    if (subscription.trial_settings?.end_behavior?.missing_payment_method !== "cancel") {
      return ok();
    }

    if (this.defaultPaymentMethodId(subscription.default_payment_method)) {
      return ok();
    }

    const customer = await this.repository.billing.getStripeCustomer(customerId);
    if (customer.isErr()) return err(customer.error);
    if (
      !customer.value.deleted &&
      this.defaultPaymentMethodId(customer.value.invoice_settings?.default_payment_method)
    ) {
      return ok();
    }

    const organization = await this.repository.billing.getOrganizationByCustomerId(customerId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value) return this.error("NOT_FOUND", "Organization not found");

    const portal = await this.repository.billing.createBillingPortalSession(customerId);
    if (portal.isErr()) return err(portal.error);

    const trialEnd =
      subscription.trial_end != null
        ? new Date(subscription.trial_end * 1000).toISOString().slice(0, 10)
        : undefined;

    const email =
      !customer.value.deleted && "email" in customer.value ? customer.value.email : null;
    if (!email) {
      this.logger.info(
        { organizationId: organization.value.id, customerId },
        "Skipping trial-ending email because the Customer has no email"
      );
      return ok();
    }

    const sent = await this.service.email.sendBrandTemplate(
      email,
      TRIAL_ENDING_TEMPLATE_KEY,
      { url: portal.value.url, trialEnd },
      { locale: organization.value.locale ?? undefined }
    );
    if (sent.isErr()) return err(sent.error);
    this.processedTrialWillEndEventIds.add(eventId);
    return ok();
  }
}
