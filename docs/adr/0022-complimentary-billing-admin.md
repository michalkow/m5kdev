# AdminActor applies existing Stripe Coupons; Complimentary is not a Kernel noun

Billing Module admin shows the catalog environment (Production / Sandbox) and lists Organizations with the current-env Stripe Customer, currency, Subscription, and Coupon (name and percent/amount). AdminActor may create a Customer, set currency only when it is null, create a Subscription (catalog Price plus either a Trial or a Coupon, or neither) when none exists, attach/replace/remove one Coupon on an existing Subscription without changing Price, or cancel (immediate or period end). Coupons are listed from the Stripe account and created in Dashboard; Kernel does not find-or-create `m5k_comp_*` Coupons and does not name Complimentary. This supersedes the 0.38.10 Complimentary enroll action. Customer-facing promo codes stay Dashboard/Portal ([ADR-0017](0017-billing-org-paywall-seat-billing-opt-in.md)).

## Considered Options

- **Complimentary as a named 100% Kernel action** — rejected: any Stripe Coupon (including 100%) is the same apply/replace path.
- **Create with any Coupon or none and no card** — rejected: Stripe refuses a charge-automatically Subscription when the Customer has no payment method and the first invoice is not $0. Without a card, create requires a Trial or a 100%-off Coupon; with a card on file, any Coupon or none.
- **Collect by emailed invoice (`send_invoice`) when there is no card** — rejected: changes the collection method for the Subscription's life.
- **Admin Trial ending in `past_due`** — rejected: an Admin-started Trial is Trial; Stripe cancels at end without a payment method and the Owner gets the trial-ending email, as for catalog Trial.
- **Trial and Coupon together at create** — rejected: pick one; Apply Coupon can add a Coupon to the Trial afterwards.
- **Kernel find-or-create 100% Coupon ids** — rejected: Coupon definitions live in Stripe Dashboard; the panel only lists and applies.
- **One `stripeCustomerId`** — rejected: sandbox would overwrite production. Production and sandbox Customer ids are separate; Kernel uses the same NODE_ENV switch as Plans; create writes only the current env’s field.
- **Admin picks production vs sandbox slot regardless of keys** — rejected: one Stripe key pair per process; create must write the field that matches those keys.
- **Stacking Coupons** — rejected: at most one Coupon; apply replaces; remove clears and never cancels.

## Consequences

- No Subscription → create on the chosen Price (Owner MemberId; Seat quantity is the billable Membership count) with either a Trial (Admin-entered days, pre-filled from the Trial Plan's `freeTrial.days` for that currency) or a Coupon. Admin Trial invite cap is that Plan's `freeTrial.seats` when set, otherwise none. Existing Subscription (including Trial) → Coupon only; Price stays. Remove Coupon does not cancel. Cutoff is Admin cancel; Organization and Customer remain.
- `invoice.payment_failed` without a payment method no longer cancels (including after a 100% Coupon ends). Trial end without a payment method still cancels (Stripe `missing_payment_method: cancel`).
- Currency: Admin may fill null, then freeze; owned-Organization currency lock still applies. Price pick requires currency. Customer create is allowed while currency is null. The list shows only the current env’s Customer id.
- Owner Checkout / Billing Portal / sidecar `extraLinks` unchanged. Starter still omits BillingModule.
