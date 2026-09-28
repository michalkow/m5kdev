# AdminActor applies existing Stripe Coupons; Complimentary is not a Kernel noun

Billing Module admin lists Organizations with the current-env Stripe Customer, currency, Subscription, and Coupon (name and percent/amount). AdminActor may create a Customer, set currency only when it is null, create a Subscription (catalog Price, optional Coupon) when none exists, attach/replace/remove one Coupon on an existing Subscription without changing Price, or cancel (immediate or period end). Coupons are listed from the Stripe account and created in Dashboard; Kernel does not find-or-create `m5k_comp_*` Coupons and does not name Complimentary. This supersedes the 0.38.10 Complimentary enroll action. Customer-facing promo codes stay Dashboard/Portal ([ADR-0017](0017-billing-org-paywall-seat-billing-opt-in.md)).

## Considered Options

- **Complimentary as a named 100% Kernel action** — rejected: any Stripe Coupon (including 100%) is the same apply/replace path.
- **Variable-percent refused so enroll works with no card** — rejected: Admin may create a Subscription with any Coupon or none; a failed invoice with no payment method stays `past_due` with access until Admin cancels.
- **Kernel find-or-create 100% Coupon ids** — rejected: Coupon definitions live in Stripe Dashboard; the panel only lists and applies.
- **One `stripeCustomerId`** — rejected: sandbox would overwrite production. Production and sandbox Customer ids are separate; Kernel uses the same NODE_ENV switch as Plans; create writes only the current env’s field.
- **Admin picks production vs sandbox slot regardless of keys** — rejected: one Stripe key pair per process; create must write the field that matches those keys.
- **Stacking Coupons** — rejected: at most one Coupon; apply replaces; remove clears and never cancels.

## Consequences

- No Subscription → create on the chosen Price (Owner MemberId; Seat quantity unchanged) with optional Coupon. Existing Subscription (including Trial) → Coupon only; Price stays. Remove Coupon does not cancel. Cutoff is Admin cancel; Organization and Customer remain.
- `invoice.payment_failed` without a payment method no longer cancels (including after a 100% Coupon ends).
- Currency: Admin may fill null, then freeze; owned-Organization currency lock still applies. Price pick requires currency. Customer create is allowed while currency is null. The list shows only the current env’s Customer id.
- Owner Checkout / Billing Portal / sidecar `extraLinks` unchanged. Starter still omits BillingModule.
