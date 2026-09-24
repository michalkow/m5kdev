# N Prices per Plan; currency is frozen on the Organization

A Plan is one commercial offering, not one Stripe Product: it cites a Product id per currency and lists Prices (interval + interval_count) under each. One app serves many currencies. `organizations.currency` is set at create like locale (payload or catalog default) and never switched. Auto-Trial is a Stripe Trial on that Product's monthly Price; Checkout stays 409; the Owner records an Interval pick on the Kernel Plan page (including monthly) which updates the Trial item; last pick wins; no pick cancels at trial_end. After convert, interval change is Billing Portal. A User may only own live Organizations in one currency (omit copies; mismatch rejects); the Customer remains the Organization.

## Considered Options

- **`quarterlyPriceId` beside `annualDiscountPriceId`** — rejected: a third special field; monthly/quarterly/yearly are Prices.
- **One currency per deploy / `StripePlansConfig.currency` only** — rejected: USD and PLN Products ship in one app.
- **Local-only Trial until Checkout** — rejected: keep Stripe's Trial clock and `trial_will_end` email; stand-in monthly Price is not the chosen Price.
- **Silent convert on the stand-in if they never pick** — rejected: monthly must be an explicit Interval pick.
- **Force the Plan page for the whole Trial** — rejected: Trial still grants access; CTA is enough.
- **Checkout during Trial** — rejected: no second Subscription; pick updates the existing item.
- **In-app interval switch after paid** — rejected: still Billing Portal ([ADR-0017](0017-billing-org-paywall-seat-billing-opt-in.md)).
- **Reuse Stripe Customer by email** — rejected: one Customer per Organization. Currency lock is Owner + live orgs, not Customer lookup.
