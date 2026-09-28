# Complimentary is an AdminActor 100% Stripe Coupon, not Trial

Platform Admin enrolls an Organization into Complimentary by applying a 100% Stripe Coupon to a Subscription on a catalog Price (any Plan in Organization currency). Duration is forever, repeating N months, or once. That is not Trial: status is `active` with $0 invoices. ADR-0017 still forbids customer-facing coupon UX and Kernel Portal Configuration; this is AdminActor-only and amends that coupons clause. Enroll is explicit (a User-role admin's Organization is not auto-free). Billing Module admin at `/admin/billing` lists Organizations and can enroll, remove Complimentary, or cancel the Subscription (immediate or at period end, chosen per action).

## Considered Options

- **Kernel paywall grant / no Stripe Subscription** — rejected: Stripe stays source of truth.
- **$0 catalog Price as complimentary** — rejected: “then they start paying” is removing a Coupon, not switching Price; Price changes stay Billing Portal.
- **Admin-set `trial_end` / calling it Trial** — rejected: Trial is catalog-only (`freeTrial.days`, Organization create or Checkout).
- **Dashboard-only coupons** — rejected: Admin must enroll from the Admin panel without leaving the app.
- **Variable percent** — rejected: 100% keeps enroll possible with no payment method.

## Consequences

- No Customer → create Customer then Subscription. No Subscription → create on the chosen Price (MemberId is the Owner). `trialing` → cancel that Trial first, then create. Paid or already Complimentary → attach or replace the Coupon; Price unchanged. Seat billing quantity is unchanged.
- Remove Complimentary or Coupon end: payment method present → the Price bills; none → cancel. A later invoice that fails with no payment method is canceled (not left `past_due`). A card that is present and fails stays `past_due` with access.
- Owner Checkout/Portal stay as today. Portal might still let an Owner remove a Coupon if Stripe Dashboard Portal Configuration allows it.
