# Subscription is per Stripe environment, same split as Customer

Customer ids and Plan catalogs already split production vs sandbox. The local Subscription did not: one latest row per Organization, so a sandbox webhook overwrote (or filled) that row and production Billing Module admin / paywall read it — Plan, Price, Trial, and Coupon with a production Customer empty. A Subscription is one mutable local row per Organization per Stripe environment (`production` | `sandbox`), the same NODE_ENV switch as the catalog. This process reads, upserts, Checkouts, Seat-bills, and cancels only its environment's row and Stripe objects. Live keys cannot cancel a test-mode Subscription.

## Considered Options

- **Hide the latest org row when its Customer is the other env** — rejected: sandbox sync still updated that same row and would clobber a live production Subscription.
- **One row, refuse to overwrite the other env** — rejected: sandbox testing could not keep its own row once production had one, and the reverse.
- **Key only by matching `subscriptions.stripe_customer_id` to the current-env Organization Customer** — rejected: the catalog already has `environment`; a column makes the unique pair `(Organization, environment)` explicit and does not depend on a Customer id being present.
- **Environment column plus Customer-id must agree** — rejected: sync always writes this process environment; mismatch is a backfill bug, not a second filter.
- **Append-only history of Stripe Subscription ids** — rejected: keep today's in-place sync, per environment.
- **Cancel both Stripe Subscriptions on Organization delete** — rejected: the other env's id fails against the wrong Stripe account. Cancel current-env only; leave the other Stripe object for that env's process or Dashboard cleanup.
- **Stamp unmatched existing rows sandbox** — rejected: only Customer-id match; unmatched stay unreadable until a current-env sync. Collapse extras so one row per `(Organization, environment)` remains.

## Consequences

- Access is current-environment `active` / `trialing` / `past_due`, or `billingExempt` (still Organization-wide). A sandbox ACCESS_STATUS does not grant production.
- Checkout "has none" means none in this environment. An Organization may have a live production Subscription and a live sandbox Subscription at the same time.
- Existing rows: stamp `environment` from `subscriptions.stripe_customer_id` vs `organizations.stripe_customer_id` / `stripe_sandbox_customer_id`. Kernel does not auto-backfill; apps generate the column and run documented SQL.
