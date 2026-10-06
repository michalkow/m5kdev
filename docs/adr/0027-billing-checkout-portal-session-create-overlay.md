# BillingModule overlays Stripe Checkout and Portal session create params

Billing stays an Organization Stripe paywall ([ADR-0017](0017-billing-org-paywall-seat-billing-opt-in.md)), not a Stripe SDK wrapper. Apps may still pass `checkoutSessionCreate` and `billingPortalSessionCreate` on the `BillingModule` constructor (next to `stripe`). Kernel builds the per-request session params, then deep-merges that bag: plain objects recurse, arrays replace, `undefined` is skipped, `null` assigns, and the app wins every leaf collision — including `mode`, `customer`, `line_items`, metadata, and URLs. Unbounded on purpose so Checkout chrome such as `tax_id_collection` does not need a Kernel allowlist.

## Considered Options

- **Reserved Kernel identity keys** — rejected: the app asked to override defaults; protecting `mode` / `customer` / `line_items` would be a second contract.
- **Curated allowlist** — rejected: Stripe keeps adding Checkout chrome; Kernel would lag.
- **`StripePlansConfig` / per-Checkout HTTP** — rejected: the bag is server-only Stripe session create params, not Plan/Price/Trial, and not per-request.
- **Shallow `Object.assign`** — rejected: extra `metadata` or `subscription_data.trial_settings` would wipe Kernel nested keys.
- **lodash.merge (arrays by index)** — rejected: index-merge of `line_items` is a trap; no lodash in the Kernel.

## Consequences

- Extra metadata keys survive; an app `line_items` array replaces the billed Price unless the app re-specifies it. Overriding `success_url` skips Kernel `/stripe/success` (webhook sync still runs). GET `/stripe/checkout` still redirects to `session.url`.
- Customer create is not this overlay. Constructor fields are optional; `new BillingModule({ stripe }, resolved)` is unchanged.
