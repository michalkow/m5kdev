import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { catalogCurrencyKeys } from "@m5kdev/commons/modules/billing/billing.utils";
import { err, ok } from "neverthrow";
import type Stripe from "stripe";
import { posthogCapture } from "../../utils/posthog";
import type { Context } from "../../utils/trpc";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BasePermissionService } from "../base/base.service";
import type { EmailService } from "../email/email.service";
import type { BillingRepository } from "./billing.repository";

const TRIAL_ENDING_TEMPLATE_KEY = "trialEnding";

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
  }: {
    organizationId: string;
    memberId: string;
    email: string;
    name?: string;
  }): ServerResultAsync<Stripe.Customer> {
    const existing = await this.repository.billing.getOrganizationById(organizationId);
    if (existing.isErr()) return err(existing.error);
    if (existing.value?.stripeCustomerId) {
      const customer = await this.repository.billing.getStripeCustomer(
        existing.value.stripeCustomerId
      );
      if (customer.isErr()) return err(customer.error);
      if (!customer.value.deleted) return ok(customer.value);
    }

    const created = await this.repository.billing.createCustomer({
      email,
      name,
      organizationId,
      memberId,
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

  async createOrganizationHook({
    organizationId,
    memberId,
    email,
    name,
  }: {
    organizationId: string;
    memberId: string;
    email: string;
    name?: string;
  }): ServerResultAsync<boolean> {
    const stripeCustomer = await this.createOrganizationCustomer({
      organizationId,
      memberId,
      email,
      name,
    });
    if (stripeCustomer.isErr()) {
      this.logger.warn(
        { err: stripeCustomer.error, organizationId },
        "Stripe Customer create failed; Organization remains without a Subscription"
      );
      return ok(false);
    }

    if (!this.repository.billing.trialRequiresPaymentMethod) {
      const organization = await this.repository.billing.getOrganizationById(organizationId);
      if (organization.isErr()) return ok(false);
      const currency = organization.value?.currency ?? this.repository.billing.defaultCurrency;
      const trialPlan = this.repository.billing.trialPlanFor(currency);
      const trialPriceId = this.repository.billing.defaultTrialPriceId(currency);
      if (trialPlan && !trialPriceId) return ok(false);

      if (trialPlan && trialPriceId) {
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

    return ok(true);
  }

  async getActiveSubscription(ctx: Context): ServerResultAsync<BillingSchema | null> {
    const organizationId = ctx.actor.organizationId;
    if (!organizationId) return this.error("FORBIDDEN", "Organization is required");

    const readGuard = this.accessGuard(ctx.actor, "read", { organizationId });
    if (readGuard.isErr()) return err(readGuard.error);

    return this.repository.billing.getAccessibleSubscription(organizationId);
  }

  async listInvoices(ctx: Context): ServerResultAsync<Stripe.Invoice[]> {
    const organizationId = ctx.actor.organizationId;
    if (!organizationId) return this.error("FORBIDDEN", "Organization is required");

    const readGuard = this.accessGuard(ctx.actor, "read", { organizationId });
    if (readGuard.isErr()) return err(readGuard.error);

    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value?.stripeCustomerId) {
      return this.error("INTERNAL_SERVER_ERROR", "Organization has no stripe customer id");
    }
    return this.repository.billing.listInvoices(organization.value.stripeCustomerId);
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

    if (this.repository.billing.trialRequiresPaymentMethod && trialPlan) {
      const defaultPriceId = this.repository.billing.defaultTrialPriceId(currency);
      if (defaultPriceId) {
        checkoutPriceId = defaultPriceId;
      } else if (!this.repository.billing.priceBelongsToTrialPlan(priceId, currency)) {
        return this.error("NOT_FOUND", "Price not found for this Trial Plan");
      }
      trialDays = trialPlan.freeTrial?.days ?? 7;
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

  async syncOrganizationSubscription(organizationId: string): ServerResultAsync<boolean> {
    const organization = await this.repository.billing.getOrganizationById(organizationId);
    if (organization.isErr()) return err(organization.error);
    if (!organization.value?.stripeCustomerId) {
      return this.error("NOT_FOUND", "Organization has no stripe customer id");
    }
    return this.syncStripeData({ customerId: organization.value.stripeCustomerId });
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
