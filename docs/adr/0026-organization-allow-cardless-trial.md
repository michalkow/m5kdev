# Organization allowCardlessTrial is an AdminActor card-on Trial waiver

Catalog `trialRequiresPaymentMethod` is app-wide: no Trial at Organization create, Checkout collects a card. Some Organizations still need one unpaid Trial without a card, without skipping the paywall. That overlay is `allowCardlessTrial` on the Organization (not `billingExempt`, not Organization `flags`). AdminActor sets it on Billing Module admin when the catalog requires a card. Turning it on starts at most one cardless Trial in the current Stripe environment (picked-at-sign-up Price else default Trial Price). Access still requires that Trial (or `billingExempt`). New Organizations start false; children do not inherit.

## Considered Options

- **Reuse `billingExempt`** — rejected: that skips the paywall and Seat billing ([ADR-0023](0023-organization-billing-exempt.md)). This org still needs a real Trial and still hits the paywall until one exists.
- **Admin Create Subscription with trialDays only** ([ADR-0022](0022-complimentary-billing-admin.md)) — rejected as the only path: Admin still has that door; the switch is the one-click waiver plus later card collection on the same Subscription.
- **Checkout without `payment_method_collection`** — rejected: the Owner would still have to start Checkout. Turning the switch on starts Trial immediately.
- **Kernel noun `skipCreditCardCheck`** — rejected: skip polarity inverts in UI copy (same as `billingExempt`). The field is `allowCardlessTrial`; Billing Module admin copy may still say Disable credit card check.
- **Reuse Organization `flags`** — rejected: Kernel Billing contract, queryable on the admin list, not an app settings string.
- **Per-environment switch** — rejected: one Organization-wide boolean like `billingExempt`. Start, one-shot consume, and Owner Portal gate apply only to the current Stripe environment ([ADR-0024](0024-subscription-per-stripe-environment.md)).
- **Children inherit / new orgs true** — rejected: a new Organization is a new row and starts false.
- **Owner or org-admin may toggle** — rejected: that is self-service card-on bypass. AdminActor only.
- **Grant access with no Trial** — rejected: that is `billingExempt`.
- **Cancel Trial when clearing** — rejected: Trial and ACCESS_STATUS stay; Owner is gated to Billing Portal until a default payment method exists. Remaining days continue if they add a card before `trial_end`. Stripe still cancels at end with no payment method.
- **Another cardless Trial via the switch after cancel** — rejected: at most one per Organization per Stripe environment. After it ends they Checkout with a card. Admin Create with trialDays still works.
- **Mutually exclusive with `billingExempt`** — rejected: Admin may start Trial while exempt, same as Create Subscription.

## Consequences

- Clearing `allowCardlessTrial` while trialing with no payment method is the one path that uses Billing Portal for the first card. That does not reopen Portal as the card-on start path ([ADR-0020](0020-trial-price-at-start-card-catalog-switch.md)): a Subscription already exists.
- Turning the switch on again while that Trial is open drops the Portal gate; Trial continues unpaid until `trial_end`.
- The switch is shown only when the catalog requires a card. Turning it on without an open Subscription, without resolvable trial days, or after this environment already consumed its cardless Trial, is refused.
- Sandbox consume does not consume production. Seat billing on the cardless Trial is unchanged unless the Organization is also `billingExempt`.
