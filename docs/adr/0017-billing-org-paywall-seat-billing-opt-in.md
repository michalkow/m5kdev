# Billing is an Organization Stripe paywall; Seat billing is opt-in

Billing is an opinionated Stripe paywall (Plan catalog, Checkout, Billing Portal, webhook sync, Trial, invoices), not a metering product. The Customer is the Organization; MemberId is attribution. Seat billing is a catalog switch the app sets on `StripePlansConfig`. Off (default): Trial is `freeTrial.days` only, Stripe quantity is one, Membership count is never a billing check. On: quantity tracks billable Memberships, Trial requires `freeTrial.seats`, invites raise Stripe quantity before the Membership exists, and `past_due` keeps access but refuses quantity increases.

## Considered Options

- **Always bill per Membership** — rejected: a flat Organization price is a common SaaS paywall; Seat billing is opt-in so TypeOrb-shaped catalogs stay days-only Trials.
- **User as Customer** — rejected: glossary already forbids personal User subscriptions and `users.stripeCustomerId`.
- **SaaS billing platform** (usage, add-ons, coupons UX, enterprise quotes) — rejected: Portal and Stripe Dashboard own those; Kernel does not.
- **In-app Plan switch** — rejected: Kernel Plan pages are acquisition (no Subscription); change Plan/interval/card in Billing Portal. Auto-Trial starts on the trial Plan's monthly Price; Checkout must not run while a Trial exists.
- **Kernel-built Portal Configuration from Plan annual Price ids** — rejected: dual config. `annualDiscountPriceId` is Checkout-only; Portal products live in the Stripe Dashboard.
- **Owner-only Stripe quantity writes** — rejected: Owner-only is Checkout and Billing Portal. Quantity updates on invite are a system call for anyone who may invite.
- **`plan.limits` / `plan.group` as Kernel contract** — rejected: unused; Seat billing does not revive a feature matrix.

## Consequences

- One currency on `StripePlansConfig`. Organization delete cancels the Stripe Subscription and keeps the Customer. Stripe Customer email is the creating Member's, then Stripe owns it. Organization create succeeds if Stripe is down; no Subscription means the paywall page.
- Billing keys the Stripe Customer on the Organization. Existing User-keyed Customers are a breaking cutover, not a supported mode.
