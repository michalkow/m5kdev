import type { BillingSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import { err, ok } from "neverthrow";
import type Stripe from "stripe";
import { posthogCapture } from "../../utils/posthog";
import type { User } from "../auth/auth.lib";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import type { Context } from "../../utils/trpc";
import { BaseService } from "../base/base.service";
import type { BillingRepository } from "./billing.repository";

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

export class BillingService extends BaseService<{ billing: BillingRepository }, never> {
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
    return this.repository.billing.getActiveSubscription(ctx.actor.userId);
  }

  async listInvoices(ctx: Context): ServerResultAsync<Stripe.Invoice[]> {
    if (!ctx.user.stripeCustomerId)
      return this.error("NOT_FOUND", "User has no stripe customer id");
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
    return this.throwableAsync(async () => {
      // Skip processing if the event isn't one I'm tracking (list of all events below)
      if (!allowedEvents.includes(event.type)) return ok(false);

      // All the events I track have a customerId
      const { customer: customerId } = event?.data?.object as {
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
      return ok(true);
    });
  }
}
