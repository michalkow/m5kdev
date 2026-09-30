# Organization billingExempt is an AdminActor paywall overlay

Products adding paid billing need a window to migrate existing Organizations one-by-one: Members keep using the app, AdminActor sets up Customer / Plan / Coupon / Trial, then turns the paywall on. That overlay is `billingExempt` on the Organization (not Coupon, not Organization `flags`, not the app-wide `skipPlanCheck` prop). True skips the paywall and all Seat billing for that Organization; new Organizations start false so they go through the catalog billing path.

## Considered Options

- **Kernel noun `skipSubscriptionCheck`** — rejected: skip polarity inverts in UI copy. The field is `billingExempt`; Billing Module admin copy may still say Skip subscription check.
- **Reuse Organization `flags`** — rejected: this is Kernel Billing contract, queryable on the admin list, not an app settings string.
- **`skipPlanCheck` only** — rejected: that prop is app-wide and not persisted; migration is per Organization.
- **Auto-backfill existing rows to true** — rejected: Kernel consumers already on paid billing would lose the paywall. Column default is false. A migrating app runs documented SQL; Kernel ships no helper and no Admin bulk.
- **Skip the Billing Module for exempt orgs** — rejected: Admin still creates Customer, Subscription, Coupon, and Trial during the window. Webhooks, Checkout, and Portal stay.
- **Skip paywall but keep Seat billing** — rejected: an exempt org with no Subscription would still fail invite/quantity checks. While exempt, skip all Seat billing (caps and quantity sync) even if a Subscription exists.
- **Require ACCESS_STATUS before clearing** — rejected: Admin may set `billingExempt` false with no Subscription; Members then hit the paywall. The UI warns.
- **Children inherit** — rejected: a new Organization is a new row and starts false, including child Organizations.
- **Owner or org-admin may toggle** — rejected: that is self-service paywall bypass. AdminActor only, on Billing Module admin.
- **Load Subscription into BillingProvider while exempt** — rejected: `billingExempt` behaves like `skipPlanCheck` for that org (no query, provider data null). When `skipPlanCheck` is true, the Organization field is ignored for the whole app.

## Consequences

- AdminActor may set `billingExempt` true on any Organization, including one that already has ACCESS_STATUS. Access stays; Seat billing stops; if the Subscription later ends they still have access until Admin clears the exemption.
- Members do not see an exemption banner. Invoice/Portal context from BillingProvider is empty while exempt even if a Subscription exists; Admin list still shows it.
- Trial-at-create is unchanged: new Organizations are not exempt, so the catalog Trial hook still runs.
