# BillingModule overlays Stripe Checkout and Portal session create params

Billing stays an Organization Stripe paywall ([ADR-0017](0017-billing-org-paywall-seat-billing-opt-in.md)), not a Stripe SDK wrapper. Apps may still pass `checkoutSessionCreate` and `billingPortalSessionCreate` on the `BillingModule` constructor (next to `stripe`). Checkout also accepts an optional server-only `resolveCheckoutSessionCreate(context)` callback. It receives the validated Experience, authorized browser source, Organization currency/locale, authoritative environment Customer and effective Checkout Price, quantity and Trial settings after commercial checks. Browser inputs contain catalog Price and a local return path; they cannot contain Stripe params or impersonate this context.

Precedence is framework defaults → static constructor overlay → contextual Checkout overlay. Each merge recurses plain objects, replaces arrays, skips `undefined` and assigns `null`. The app wins every leaf collision — including `mode`, `customer`, `line_items`, metadata, and URLs. Unbounded on purpose so supported Checkout presentation such as `branding_settings` does not need a Kernel allowlist. Portal's existing static overlay remains unchanged by this Checkout extension.

Normal Checkout defaults bind Experience/destination and original User/session/active Organization to a signed continuation and correlate an actual Stripe Session through its metadata nonce and literal Session-id placeholder. Return reauthorizes live Owner membership, current environment/Customer mapping and actual Stripe Session before reconciliation. Shared APIs require canonical authenticated initiation with configured browser Origin; no website selects billing authority. This does not change the single-Subscription commercial model in ADR-0034.

## Considered Options

- **Reserved Kernel identity keys** — rejected: the app asked to override defaults; protecting `mode` / `customer` / `line_items` would be a second contract.
- **Curated allowlist** — rejected: Stripe keeps adding Checkout chrome; Kernel would lag.
- **Browser-supplied per-Checkout Stripe params** — rejected: both overlays are trusted server configuration; Plan/Price/Trial remain catalog policy. Contextual presentation is resolved only after authorization.
- **Shallow `Object.assign`** — rejected: extra `metadata` or `subscription_data.trial_settings` would wipe Kernel nested keys.
- **lodash.merge (arrays by index)** — rejected: index-merge of `line_items` is a trap; no lodash in the Kernel.

## Consequences

- Extra metadata keys survive; an app `line_items` array replaces the billed Price unless the app re-specifies it. Overriding `success_url` skips Kernel `/stripe/success` (webhook sync still runs). GET `/stripe/checkout` still redirects to `session.url`.
- Customer create is not this overlay. Constructor fields are optional; `new BillingModule({ stripe }, resolved)` is unchanged.
- Custom success/cancel URLs bypass the normal return contract. Replacing Customer or correlation metadata while keeping the normal handler can cause a safe return rejection; the app owns that custom integration. Kernel does not reinsert reserved keys after the app overlay. Webhook reconciliation still runs from verified Stripe events.
- Existing shorthand app metadata and a usable stable `BETTER_AUTH_SECRET` automatically support new signed Checkout returns. Missing/short legacy Auth keys retain the old raw convenience path; no weak/random signer is created. Explicit/strict invalid signing keys fail validation.
- Older raw `/stripe/success` remains only a nonstrict, fresh-Owner reconciliation of the current Organization's authoritative Customer, returning to the configured default Billing page. It cannot identify a historical Checkout. Strict adoption rejects raw returns; webhooks still reconcile, and the User can reopen Billing. Partial/malformed signed inputs never fall back to raw behavior. No historical issuance timestamp is invented.
- Signed browser returns require the original session and active Organization and expire after 24 hours. Open/expired Stripe Sessions are rejected; a completed Session remains authoritative after its original open-session deadline while the proof is valid. Changed context requires reopening Billing; the handler never switches the session Organization. Repeated valid returns reconcile idempotently rather than claiming one-use payment fulfillment.
