import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { err, ok } from "neverthrow";
import type Stripe from "stripe";
import { posthogCapture } from "../../utils/posthog";
import type { Context } from "../../utils/trpc";
import type { User } from "../auth/auth.lib";
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

  async createUserCustomer({
    user,
  }: {
    user: { id: string; email: string; name?: string };
  }): ServerResultAsync<Stripe.Customer> {
    let stripeCustomer: Stripe.Customer | null = null;
    const existingCustomer = await this.repository.billing.getCustomerByEmail(user.email);
    if (existingCustomer.isErr()) return err(existingCustomer.error);
    stripeCustomer = existingCustomer.value;
    if (!stripeCustomer) {
      const newCustomer = await this.repository.billing.createCustomer({
        email: user.email,
        name: user.name,
        userId: user.id,
      });
      if (newCustomer.isErr()) return err(newCustomer.error);
      stripeCustomer = newCustomer.value;
    }

    if (!stripeCustomer)
      return this.error("INTERNAL_SERVER_ERROR", "Failed to create or get stripe customer");
    const updatedUser = await this.repository.billing.updateUserCustomerId({
      userId: user.id,
      customerId: stripeCustomer.id,
    });
    if (updatedUser.isErr()) return err(updatedUser.error);
    return ok(stripeCustomer);
  }

  async createUserHook({
    user,
  }: {
    user: { id: string; email: string; name?: string };
  }): ServerResultAsync<boolean> {
    const stripeCustomer = await this.createUserCustomer({ user });
    if (stripeCustomer.isErr()) return err(stripeCustomer.error);

    if (this.repository.billing.hasTrial()) {
      const existingSubscription = await this.repository.billing.getLatestSubscription(user.id);
      if (existingSubscription.isErr()) return err(existingSubscription.error);
      if (!existingSubscription.value) {
        const subscription = await this.repository.billing.createTrialSubscription(
          stripeCustomer.value.id
        );
        if (subscription.isErr()) return err(subscription.error);
      }
      const syncResult = await this.syncStripeData(stripeCustomer.value.id);
      if (syncResult.isErr()) return err(syncResult.error);
      if (syncResult.value === false)
        return this.error("INTERNAL_SERVER_ERROR", "Sync did not create new subscription");
    }

    return ok(true);
  }

  async getActiveSubscription(ctx: Context): ServerResultAsync<BillingSchema | null> {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    return this.repository.billing.getActiveSubscription(ctx.actor.userId);
  }

  async listInvoices(ctx: Context): ServerResultAsync<Stripe.Invoice[]> {
    const readGuard = this.accessGuard(ctx.actor, "read", { userId: ctx.actor.userId });
    if (readGuard.isErr()) return err(readGuard.error);

    if (!ctx.user.stripeCustomerId)
      // the signup hook should have created the customer — its absence means that hook failed
      return this.error("INTERNAL_SERVER_ERROR", "User has no stripe customer id");
    return this.repository.billing.listInvoices(ctx.user.stripeCustomerId);
  }

  async createCheckoutSession(
    { priceId }: { priceId: string },
    { user }: { user: User }
  ): ServerResultAsync<Stripe.Checkout.Session> {
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await this.createUserCustomer({ user });
      if (stripeCustomer.isErr()) return err(stripeCustomer.error);
      stripeCustomerId = stripeCustomer.value.id;
    }
    return this.repository.billing.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      userId: user.id,
    });
  }

  async createBillingPortalSession({
    user,
  }: {
    user: User;
  }): ServerResultAsync<Stripe.BillingPortal.Session> {
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await this.createUserCustomer({ user });
      if (stripeCustomer.isErr()) return err(stripeCustomer.error);
      stripeCustomerId = stripeCustomer.value.id;
    }
    return this.repository.billing.createBillingPortalSession(stripeCustomerId);
  }

  constructEvent(body: Buffer | string, signature: string): ServerResult<Stripe.Event> {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      return this.error("INTERNAL_SERVER_ERROR", "Stripe webhook secret is not set");
    return this.repository.billing.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  }

  async syncStripeData(customerId: string, eventType?: string): ServerResultAsync<boolean> {
    const user = await this.repository.billing.getUserByCustomerId(customerId);
    if (user.isErr()) return err(user.error);
    if (!user.value) return this.error("NOT_FOUND", "User not found");

    if (eventType) {
      posthogCapture({
        distinctId: user.value.id,
        event: `stripe.${eventType}`,
        properties: {
          customerId,
        },
      });
    }
    return this.repository.billing.syncStripeData({ customerId, userId: user.value.id });
  }

  async processEvent(event: Stripe.Event): ServerResultAsync<boolean> {
    // Skip processing if the event isn't one I'm tracking (list of all events below)
    if (!allowedEvents.includes(event.type)) return ok(false);

    // All the events I track have a customerId
    const { customer: customerId } = event.data.object as {
      customer: string; // Sadly TypeScript does not know this
    };

    // This helps make it typesafe and also lets me know if my assumption is wrong
    if (typeof customerId !== "string") {
      return this.error(
        "INTERNAL_SERVER_ERROR",
        `[STRIPE HOOK] Unexpected event structure: customer ID is not a string. Event type: ${event.type}`
      );
    }

    const result = await this.syncStripeData(customerId, event.type);
    if (result.isErr()) return err(result.error);

    if (event.type === "customer.subscription.trial_will_end") {
      const trialEnding = await this.sendTrialEndingWarning({
        customerId,
        eventId: event.id,
        subscription: event.data.object as Stripe.Subscription,
      });
      if (trialEnding.isErr()) return err(trialEnding.error);
    }

    return ok(true);
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

    const user = await this.repository.billing.getUserByCustomerId(customerId);
    if (user.isErr()) return err(user.error);
    if (!user.value) return this.error("NOT_FOUND", "User not found");
    if (!user.value.email) {
      this.logger.info(
        { userId: user.value.id, customerId },
        "Skipping trial-ending email because the User has no email"
      );
      return ok();
    }

    const portal = await this.repository.billing.createBillingPortalSession(customerId);
    if (portal.isErr()) return err(portal.error);

    const trialEnd =
      subscription.trial_end != null
        ? new Date(subscription.trial_end * 1000).toISOString().slice(0, 10)
        : undefined;

    const sent = await this.service.email.sendBrandTemplate(
      user.value.email,
      TRIAL_ENDING_TEMPLATE_KEY,
      { url: portal.value.url, trialEnd },
      { locale: user.value.locale ?? undefined }
    );
    if (sent.isErr()) return err(sent.error);
    this.processedTrialWillEndEventIds.add(eventId);
    return ok();
  }
}
