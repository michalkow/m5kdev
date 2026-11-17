---
sidebar_position: 3
---

# Billing module

The billing module is the Stripe paywall: Plan catalog, Checkout, Billing Portal,
webhook-driven Subscription sync, and plan-selection UI. The Customer is the
Organization (ADR-0017). When a catalog defines Capabilities, Billing also owns
Organization Entitlements (ADR-0034).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `StripePlan` / `StripePlansConfig` types, billing schema, plan utilities, Capability catalog helpers. |
| `@m5kdev/backend` | `BillingModule`: `subscriptions` table, repository, `BillingService`, `BillingPermissionService`, Stripe HTTP, tRPC procedures. |
| `@m5kdev/frontend` | `BillingProvider`, `useSubscription`, `EntitlementProvider`, `useEntitlements`. |
| `@m5kdev/web-ui` | `BillingPaywallProvider`, `EntitlementGate`, `BillingRouter`, plan select pages, invoice page, beta page, `BillingAdminRouter`. |

## Plan configuration

Plans are plain objects shared between backend and frontend. A Plan cites a
Stripe Product id per currency and 1..N Prices (interval + interval_count) under
each Product. Seat billing is a catalog switch (default off). Organization
currency is frozen at create.

```ts
import type { StripePlansConfig } from "@m5kdev/commons/modules/billing/billing.types";
import { getEnvironmentPlans } from "@m5kdev/commons/modules/billing/billing.utils";

const plansConfig: StripePlansConfig = {
  defaultCurrency: "usd",
  trialPlanName: { usd: "pro", pln: "pro" },
  trialRequiresPaymentMethod: false,
  production: [
    {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          defaultPriceId: "price_usd_month",
          prices: [
            { priceId: "price_usd_month", interval: "month", intervalCount: 1, unitAmount: 14900, freeTrialDays: 14 },
            { priceId: "price_usd_quarter", interval: "month", intervalCount: 3, unitAmount: 29800, freeTrialDays: 0 },
            { priceId: "price_usd_year", interval: "year", intervalCount: 1, unitAmount: 89400, freeTrialDays: 0 },
          ],
        },
        pln: {
          id: "prod_pln",
          defaultPriceId: "price_pln_month",
          prices: [
            { priceId: "price_pln_month", interval: "month", intervalCount: 1, unitAmount: 59900 },
          ],
        },
      },
      freeTrial: { days: 14 },
    },
  ],
  sandbox: [/* sandbox Price ids */],
};

const resolved = getEnvironmentPlans(plansConfig, process.env.NODE_ENV);
```

When `seatBilling: true`, each Trial Plan must set `freeTrial.seats`. Optional
`nonBillableRoleKeys` lists Roles that do not consume Stripe quantity (Owner is
always billable).

Trial length is `resolveTrialDays` in `@m5kdev/commons/modules/billing/billing.utils`:
optional `freeTrialDays` on the Price being billed, else plan `freeTrial.days`.
A Price `freeTrialDays: 0` means no Trial for that Price (omit Stripe
`trial_period_days`); it does not fall through to the Plan or to 7. Catalogs
that only set plan-level `freeTrial.days` keep that length for every Price.
`freeTrial.seats` stays plan-level. Checkout, card-off Trial start, Admin Create
Subscription prefill, and Plan UI all use the billed Price. Identity is Price
id; quarter is `{ interval: "month", intervalCount: 3 }`.

`trialPlanName` is a currency → Plan name map. Omit it for Checkout-only
catalogs. When `trialRequiresPaymentMethod` is false (the default), each Trial
Plan Product must set `defaultPriceId`; Kernel starts Trial on that Price at
Organization create. When it is true, there is no Trial until Checkout:
`defaultPriceId` skips the Plan page; otherwise the Owner picks a Price id then
Checkouts. After convert, interval change is Billing Portal.

### Trial Price at sign-up

A landing page can pick the Trial Price (for example quarterly or yearly
instead of the monthly default) by linking to sign-up with `?price=<priceId>`.
The sign-up form sends it as the `User-Price-Id` header; social sign-up keeps it
in OAuth state (`userPriceId`). The Price id also carries its currency: a Trial
Plan Price sets Organization currency and wins over the `User-Currency` header.
The header applies only when no Price is sent or the Price is not on a Trial Plan.

At Organization create, Billing keeps the Price only when it belongs to the
Trial Plan for Organization currency, and stores it as `trialPriceId` in the
Stripe Customer metadata. There is no database column. When a card is not
required, Trial starts on that Price. When a card is required, Checkout uses it
in place of `defaultPriceId`, so the Owner can Checkout later from any device.
Without a stored Price (none picked, not on the Trial Plan, or Stripe was down at
sign-up), Billing falls back to the default Price.

## Organization Entitlements

Billing owns Organization Entitlements. There is no Entitlement Backend Module,
no Entitlement tables, and no Stripe Entitlements API. A Grant never creates a
Capability. See ADR-0034 (`docs/adr/0034-billing-owns-organization-entitlements.md`).

App shared defines Capability keys and immutable Bundles. Each Plan names 1..N
Bundle revisions. At evaluation time, a current-environment ACCESS_STATUS
Subscription contributes those Bundles (the Assignment is derived, not stored).
`billingExempt` allows every Capability currently in the catalog, including keys
added after the flag. Otherwise the Capability is denied. Apps that omit Billing
(Starter) stay Grant-only.

```ts
import {
  booleanCapability,
  composeCapabilities,
  defineBundles,
  defineCapabilities,
} from "@m5kdev/commons/modules/billing/billing.entitlements";

const capabilities = composeCapabilities(
  defineCapabilities({
    "resources.analyze": booleanCapability(),
  }),
  defineCapabilities({
    "apps.typeorb": booleanCapability(),
    "typeorb.publish": booleanCapability(),
  })
);

const entitlements = defineBundles(capabilities, {
  "brain@1": ["resources.analyze"],
  "typeorb@1": ["apps.typeorb", "typeorb.publish", "resources.analyze"],
});

const plansConfig: StripePlansConfig = {
  defaultCurrency: "usd",
  entitlements,
  production: [
    {
      name: "pro",
      bundles: ["typeorb@1"],
      products: { /* ... */ },
    },
  ],
  sandbox: [/* sandbox Price ids */],
};
```

Duplicate Capability keys fail when `composeCapabilities` runs (typically while
the catalog module loads). Unknown Bundle names on **production or sandbox**
Plans fail in `getEnvironmentPlans` and again when `BillingModule` constructs.
An omitted `bundles` list contributes nothing. A second brand is a Plan switch,
not a second Subscription: one row per Organization per environment stays unique.

### Procedure chain

Services that check Capabilities extend `BillingPermissionService` and declare
`billing` in their service map. Chain Entitlement after OrganizationActor and
before Grant. The array means every listed Capability. Jobs call
`BillingService.requireAll` directly. Grant-only services stay on
`BasePermissionService`. Kernel `base/` does not import Billing.

```ts
import { BillingPermissionService } from "@m5kdev/backend/modules/billing/billing.permission-service";

class TypeOrbService extends BillingPermissionService<
  { typeOrb: TypeOrbRepository },
  { billing: BillingService }
> {
  readonly publish = this.procedure("publish")
    .requireAuth("organization")
    .requireEntitlements(["typeorb.publish"])
    .access({ action: "publish" })
    .handle(({ ctx }) => this.publishPost(ctx.actor));
}
```

Entitlement denial is `FORBIDDEN` with `{ kind: "entitlement", capabilities, reason }`.
Grant `FORBIDDEN` has no Entitlement context. Unknown Capability keys are
`BAD_REQUEST`, not a denial.

`skipPlanCheck` on `BillingProvider` is chrome only: it skips the Plan page and
does not mark Capabilities allowed. `billingExempt` is the Organization overlay
that allows the full catalog.

### Snapshot and gate

Members load one Organization-scoped snapshot from `billing.getEntitlements`.
Query identity includes Organization id. `BillingPaywallProvider` wraps
`EntitlementProvider` around its children, including when `skipPlanCheck` skips
paywall chrome, so compose that wrap in `Providers.tsx`. `EntitlementGate`
renders pending, error, denied, or allowed. A failed snapshot is error, not
denied. The frontend snapshot is not authoritative; the server check is.

```tsx
import { EntitlementGate } from "@m5kdev/web-ui/modules/billing/components/EntitlementGate";

<BillingPaywallProvider planPage={<BillingPlanSelect plans={plans} />} skipPlanCheck={false}>
  <EntitlementGate
    capabilities={["apps.typeorb"]}
    pending={<Spinner />}
    error={<ErrorState />}
    denied={<UpgradePrompt />}
  >
    <TypeOrbApp />
  </EntitlementGate>
</BillingPaywallProvider>
```

## Backend

### Registration

```ts
import Stripe from "stripe";
import { createBackendApp } from "@m5kdev/backend/app";
import { BillingModule } from "@m5kdev/backend/modules/billing/billing.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { getEnvironmentPlans } from "@m5kdev/commons/modules/billing/billing.utils";

createBackendApp(config, [
  new EmailModule(templates),
  new BillingModule({ stripe: new Stripe(process.env.STRIPE_SECRET_KEY!) }, resolved),
]);
```

`BillingModule` mounts Checkout, success, Billing Portal, and the Stripe webhook
at `/stripe`. Owner-only for Checkout and Billing Portal. Members may read the
Subscription and invoices.

Pass extra Stripe session create fields on the constructor. Kernel builds the
per-request params first, then deep-merges the bag: plain objects recurse,
arrays replace, `undefined` is skipped, `null` assigns, and the app wins leaf
collisions (ADR-0027). Kernel does not reserve `mode`, `customer`, `line_items`,
or metadata.

```ts
new BillingModule(
  {
    stripe: new Stripe(process.env.STRIPE_SECRET_KEY!),
    checkoutSessionCreate: {
      tax_id_collection: {
        enabled: true,
        required: "if_supported",
      },
    },
    billingPortalSessionCreate: {
      locale: "auto",
    },
  },
  resolved
);
```

`billingPortalSessionCreate` is the same overlay for Billing Portal sessions.
Overriding `success_url` skips Kernel `/stripe/success` (webhook sync still
runs). GET `/stripe/checkout/:priceId` still redirects to `session.url`.

### Contextual Checkout presentation and returns

Add the optional server-only callback alongside the static overlay:

```ts
new BillingModule({
  stripe,
  checkoutSessionCreate: { tax_id_collection: { enabled: true } },
  resolveCheckoutSessionCreate: async ({ experience, organization, checkout }) => ({
    branding_settings: { display_name: experience.brand.name },
    metadata: { experience: experience.id, billingLocale: organization.locale ?? "en" },
    // checkout contains the effective priceId, quantity, trialDays and card policy.
  }),
}, resolved);
```

Precedence is framework defaults → static overlay → contextual overlay. The same
merge rules apply at both stages. The callback receives a readonly approved
Experience, Stripe environment, Organization id/currency/locale, authoritative
Customer id, authorized browser User/session/Member source and effective Checkout
values after Owner/catalog/Subscription checks. Experience changes presentation;
it cannot choose an Organization, currency, paid Capability or second Subscription.
The browser can send only `{ priceId, returnPath? }`, not Stripe parameters.

For a domain-local canonical API/proxy, use
`GET /stripe/checkout/:priceId?returnPath=%2Fbilling`. Strict mode requires the
canonical authenticated API authority: a host-only cookie from an alias or a
web-only authority would not reach the provider's canonical return. For a distinct
shared API, call the authenticated `billing.startCheckout` tRPC mutation with the
configured browser Origin, then navigate to the returned `{ url }`. Top-level GET
navigation usually has no Origin; an ambiguous shared start is rejected. The
browser must actually be authenticated on that API; this adds no cross-domain SSO.

Returns bind the canonical web destination to the original User, session, active
Organization, live Owner Membership, environment and Customer. The default success
URL carries a literal `{CHECKOUT_SESSION_ID}` for Stripe substitution; the handler
retrieves that Session and compares its metadata nonce, Customer, live/test environment and
completed status before reconciling the Organization Subscription. Cancellation
validates its own signed context and only navigates. A valid repeated return can
reconcile again idempotently; browser success is not payment/fulfillment authority.
Verified webhooks continue to reconcile when the browser never returns.

Switching session/active Organization, leaving Owner membership, or using an
invalid/expired link rejects the return without switching the session Organization.
Sign in on the original website, select the original Organization and reopen
Billing. Proofs last 24 hours. Open/expired Sessions are rejected; a completed Session
remains authoritative after its original open-session deadline while that proof
is valid. Trusted overrides of URLs own any changed continuation behavior. External
and protocol-relative return paths are rejected; default local return is `/billing`.

App overlays retain full override power. A custom success/cancel URL bypasses the
normal handler. Replacing Customer or correlation metadata while leaving the
normal success URL may deliberately cause a safe return rejection. Configure an
app-owned return integration for that use case; Kernel does not silently restore
reserved fields after your overlay. Portal uses the same overlay precedence as
described below.

Existing single-Experience name/URLs/environment authoring and static constructor
options remain supported. A normalized `BETTER_AUTH_SECRET` of at least 32 characters
(or explicit `experienceFlowSecret`) supplies the shared immutable signer for new
Checkout continuations. Short/missing legacy Auth keys keep their old raw path;
configure a stable runtime signing key to enable correlation. Explicit or strict
invalid keys fail validation; there is no weak or random signing fallback. A custom
`returnPath` requires signing and is rejected before Stripe Session creation when
no signer is available; default unsigned shorthand destinations and trusted static
overlays retain their existing behavior. Existing
single-Experience Auth email links keep their raw format.

Old raw `/stripe/success` links remain a nonstrict convenience: a freshly verified
Owner can reconcile the current Organization's authoritative Customer and return
to the configured default Billing page. Such a URL cannot identify a historical
Checkout. Strict registry adoption rejects raw links, while Stripe webhooks still
reconcile and the User can reopen Billing. A malformed or partially signed link
never falls back to raw behavior; there is no invented issuance timestamp.

Custom service composition can inject `{ registry, flows, resolveCheckoutSessionCreate }`
as BillingService's fourth constructor argument. Portal adds
`resolveBillingPortalSessionCreate` in that same runtime object. `startCheckout(input, context)`
and `completeCheckout({ ...input, kind }, context)` require the explicit browser User/
session and validated presentation/request context. The completing route supplies
`kind: "success" | "cancel"`; it never comes from an untrusted query field. An
optional Actor, when present, is the actual authorized OrganizationActor; direct
User/session integrations do not need to fabricate one. Existing server-owned commercial
`createCheckoutSession` calls retain their Owner fields and now recheck live Member
and open Organization. Strict compositions require the approved presentation and
shared signer; contextual callbacks also require explicit presentation in shorthand
mode. Direct presentation must name the actual Member's User and a validated local
destination before any Stripe effects.
Direct Repository construction supplies `checkoutUrls` and `portalReturnUrl` from
approved composition metadata; it no longer reads singular Checkout/Portal URLs
from environment at request time.

The installed Stripe SDK supports per-session `branding_settings` on hosted
Checkout. Display name/logo/colors do not replace legal business identity, invoice,
receipt or account email settings. Portal appearance and custom merchant domains
have separate Stripe account/configuration limits. A second product still uses a
combined Plan or permitted Portal Plan switch (ADR-0034), never another concurrent
Subscription/Trial/Stripe account.

Sandbox smoke: with an explicitly configured test key/catalog, create two branded
hosted Checkouts, inspect supported header/logo and cancel behavior, complete using
Stripe test payment data, and verify actual Session/customer/nonce reconciliation
before the canonical return. Also verify a signed webhook with no browser return.
Inspect account-level invoice/receipt identity separately. Recording-adapter tests
do not establish live Stripe hosted appearance; never run this check with a live key.

### Contextual Portal and trial-ending mail

Register Portal customization alongside its existing static bag:

```ts
new BillingModule({
  stripe,
  billingPortalSessionCreate: { locale: "auto" },
  resolveBillingPortalSessionCreate: ({ experience, organization, source }) => ({
    configuration: portalConfigurations[experience.id],
    locale: organization.locale === "pl" ? "pl" : "auto",
    // source.kind is browser or trial-ending; only browser has User/session/Member.
  }),
}, resolved);
```

The readonly context contains the approved Experience, environment, Organization
id/currency/locale and authoritative Customer id. Browser source has the original
`userId`, `sessionId`, `memberId`; `trial-ending` source has trusted `eventId` and
`subscriptionId`. The same defaults → static → contextual deep merge applies,
including array replacement, undefined skipping and null assignment. Callback
failure returns an error before Portal creation. Paid Plan/interval/card management
stays in Portal; the app's catalog and Stripe Portal configuration control allowed
transitions. Experience never creates a second Subscription, Trial or Stripe account.

`GET /stripe/portal?returnPath=%2Fbilling` uses a canonical domain-local API/proxy.
For a shared API, use authenticated `billing.startPortal({ returnPath? })` tRPC POST
with its allowlisted browser Origin, then navigate to the returned `{ url }`.
Browser inputs cannot select Customer, configuration or arbitrary Stripe params.
`BillingService.startPortal`/`completePortal` own live authorization and returns;
`createBillingPortalSession(fields, presentation?)` remains the server composition
seam with fresh Owner checks. Strict direct calls require approved browser
presentation/shared signer; a contextual hook also needs presentation in shorthand.

Normal browser returns at `/stripe/portal/return` validate the bound original
User/session/Member/active Organization, current live Owner and current
environment-specific Customer. They then reconcile that original Customer before
navigating to the canonical web destination. Shared no-Origin callbacks use the
proof only for a configured API/Origin pair. Invalid/expired/foreign returns do not
sync another Organization or switch the session's active Organization. Proofs last
24 hours; this does not extend Stripe's own Portal URL/session lifetime. Repeated
valid returns resync idempotently. The no-key legacy shorthand keeps its old raw
`/stripe/success` convenience; only the standard stable-key form provides the new
correlation. Strict old raw links must be reopened from Billing.

Stripe Portal has **create only**, no Session retrieve/attestation API. The return
handler verifies the signed application resource and current authorization; it does
not verify which actual external Portal Session/customer was visited. Trusted
Customer overrides remain unbounded and app-owned. If an overlay changes Customer
while retaining the normal return, it still reconciles only the originally signed
authoritative Customer. A custom return_url owns its navigation. Signed webhook
reconciliation remains independent of these choices.

For trial-ending warnings, register the existing [Email communication policy](/modules/email):

```ts
import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import type { CommunicationPolicy } from "@m5kdev/backend/modules/email/email.schema";

// App-owned routing from trusted resources, not recipient email or a previous visit.
const subscriptionExperiences = new Map([
  ["sub_product_a", experienceIdSchema.parse("product-a")],
  ["sub_product_b", experienceIdSchema.parse("product-b")],
]);
const communicationPolicy: CommunicationPolicy = ({ event, resourceId }) =>
  event === "billing.trial-will-end" && resourceId
    ? subscriptionExperiences.get(resourceId)
    : undefined;
new EmailModule(templates, { templateSets, communicationPolicy });
```

After verified-event reconciliation and existing missing-payment-method checks,
Billing passes exactly `{ event: "billing.trial-will-end", eventId, organizationId,
resourceId: subscription.id }`. It resolves policy once, checks the selected
optional template, and uses that same descriptor for Portal creation and mail.
Missing/removed/disabled/invalid policy fails before Portal/send when a message can
be sent. If no enabled reachable selection has `trialEnding`, the optional feature
remains a successful no-op without policy. A selected named set may omit it and
skip; it never falls back to the base template. Unreferenced/disabled-only sets do
not enable the feature. Customer email remains the recipient, Organization locale
is preserved, and current payment-method/no-recipient skips do not require policy.
The external Stripe Portal CTA is a trusted template prop, not a local linkPaths URL.

Communication return has no fabricated issuing browser. It requires a real current
live Owner with the signed Organization active and its current Customer/environment
mapping. Another current Owner may use it; Customer email is not Membership proof.
Sign in at the original website, select that Organization and reopen Billing when
context or expiry prevents returning. Warning delivery suppression remains an
in-memory process-local set after successful send: sequential duplicates still
reconcile but do not resend, failures can retry, and later distinct events can send.
This is not durable or concurrent exactly-once delivery.

Portal configuration can vary supported headline/features/legal links. Displayed
business identity, account appearance, one account custom domain and Stripe email
settings have account-level limits; configuration is not full merchant white labeling.
No external sandbox appearance claim follows from recording tests. With an explicitly
supplied test key/catalog/configurations, manually open A/B Portal sessions, inspect
supported presentation, make a safe permitted Plan/interval/card change, return and
verify the original resource's reconciliation; then trigger a signed trial event
and retry. Do not change account-wide branding or use live credentials for that smoke.

This is a breaking cutover from User-keyed Stripe Customers. The Customer lives
on the Organization: `organizations.stripe_customer_id` in production and
`organizations.stripe_sandbox_customer_id` otherwise, chosen by the same
`getEnvironmentPlans` environment as the Plan catalog, so a sandbox Customer
never overwrites the live one. `users.stripe_customer_id` is removed.
Existing User Customers are not mapped; Billing is Organization-only. Generate
Drizzle migrations for the Organization column, Subscription `memberId`, and
the dropped User column — do not hand-write them.

`BillingModule` `dependsOn` Email. Register `EmailModule` in the same
`createBackendApp` call or boot fails with
`Backend module "billing" is missing required dependency "email"`. Auth already
requires Email, so most apps only need to keep that registration.

Auth starts Trial on Organization create (`createOrganizationHook`) when a
card is not required. When Trial requires a payment method, Organization create
still may create the Customer; access waits on Checkout. Organization create
succeeds if Stripe is down; the paywall shows until a Subscription exists.

### Service

`BillingService` implements the sync-from-Stripe pattern:

- `createOrganizationHook` — Stripe Customer on the Organization; optional Trial on the sign-up Trial Price, or the default Price for Organization currency, when a card is not required and `resolveTrialDays` for that Price is defined. If that Price has no trial days, Kernel skips Trial start (same fail-open as no Trial Plan) instead of creating a paid Subscription without a card.
- `trialPriceCurrency` — currency of a Trial Plan Price, or `undefined`; Auth uses it to set Organization currency from `User-Price-Id` ahead of `User-Currency`.
- `createCheckoutSession` / `createBillingPortalSession` — Stripe-hosted flows
  (Owner only; Checkout refused while an open Subscription exists in this
  environment). When Trial
  requires a payment method, Checkout sets `trial_period_days` from
  `resolveTrialDays` for the Checkout Price (omit when that Price has no trial
  days) and `payment_method_collection: always`.
- `getActiveSubscription`, `listInvoices` — Organization-scoped reads. Access
  includes current-environment `active`, `trialing`, and `past_due`. A sandbox
  ACCESS_STATUS does not grant production (ADR-0024).
- `evaluate`, `requireAll`, `snapshot` — Organization Entitlements from the
  current-environment Plan Bundles, or the full catalog when `billingExempt`.
  Unknown Capability keys error. Jobs call `requireAll`.
- `adjustBillableSeats` — Seat billing quantity (no-op when Seat billing is off).
- `cancelOrganizationSubscription` — cancel in Stripe, keep the Customer.
- AdminActor Billing Module admin (ADR-0022, ADR-0023): list Organizations and Coupons,
  create a Stripe Customer, set Organization currency when it is null, create a
  Subscription on a catalog Price with either a Trial (Admin-entered days,
  pre-filled from `resolveTrialDays` for the selected Price) or a Coupon, apply /
  replace / remove one Coupon on an existing Subscription (Price unchanged),
  cancel, toggle `billingExempt` (UI copy: Skip subscription check), and on a
  card-on catalog toggle `allowCardlessTrial` (UI copy: Disable credit card check).
  Turning `allowCardlessTrial` on starts at most one cardless Trial in this Stripe
  environment. Clearing it keeps Trial; after consume, the Owner is gated to Billing
  Portal until a default payment method exists. Without a payment method on the Customer, create requires a Trial
  or a 100%-off Coupon (Stripe cannot charge a first invoice without one). An
  Admin Trial ends like catalog Trial: Stripe cancels without a card. The page
  shows the catalog environment (Production / Sandbox). The listed Subscription
  is that environment's row only; Customer ids were already split in 0.38.11.
  Coupons are listed from the Stripe account; create them in the Dashboard.
  Removing a Coupon never cancels. `billingExempt` skips the paywall and Seat
  billing for that Organization; new Organizations start false. Kernel does not
  backfill. `BillingProvider` skips `getActiveSubscription` when
  `skipPlanCheck` is true (whole app) or the active Organization is
  `billingExempt`. `allowCardlessTrial` does not skip the paywall.
- `constructEvent`, `processEvent`, `syncStripeData` — webhook verify and re-sync.
  A failed invoice stays `past_due` with access, with or without a payment
  method; AdminActor cancel is the cutoff.
- Trial cancel warning — on `customer.subscription.trial_will_end`, after sync,
  Billing emails a Billing Portal CTA when Stripe would cancel for a missing
  payment method. Requires a reachable selected `trialEnding` template and explicit communication policy in strict mode. Stripe
  fires that event about three days before Trial end. See
  [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration).

### HTTP routes

Mounted under `/stripe` by `BillingModule`.

| Route | Purpose |
| --- | --- |
| `GET /stripe/checkout/:priceId` | Redirect to a Stripe Checkout session (Owner) |
| `GET /stripe/portal` | Canonical domain-local Portal start (live Owner) |
| `GET /stripe/portal/return` | Signed browser/communication Portal return and original-resource reconciliation |
| `GET /stripe/success` | Validated correlated Checkout return and Subscription sync; narrow raw convenience only in shorthand mode |
| `GET /stripe/cancel` | Validated Checkout cancellation navigation |
| `POST /stripe/webhook` | Stripe Subscription webhook (raw body, verified with `STRIPE_WEBHOOK_SECRET`). This is Billing, not [Inbound callback](/modules/webhook). |

### tRPC procedures

Organization-scoped.

| Procedure | Description |
| --- | --- |
| `billing.startCheckout` | Owner browser mutation taking catalog `priceId` and optional local `returnPath`, returning `{ url }`; supports a configured shared API Origin |
| `billing.startCheckout` / `billing.startPortal` | Authenticated browser POST starts with domain inputs and validated Experience/Origin |
| `billing.getActiveSubscription` | Current accessible Subscription or `null`. Includes `ownerMustAddPaymentMethod` for the Owner after a consumed cardless Trial when the catalog requires a card, the switch is off, status is `trialing`, and there is no default payment method |
| `billing.getEntitlements` | Organization Entitlement snapshot (allowed Capability keys and per-key reasons). Query identity includes Organization id |
| `billing.getTrialPriceId` | Trial Price picked at sign-up (from Stripe Customer metadata) or `null` |
| `billing.listInvoices` | Stripe invoices for the Organization Customer |

AdminActor (`adminProcedure`). Input includes `organizationId` because the
AdminActor is not in that Organization.

| Procedure | Description |
| --- | --- |
| `billing.listAdminOrganizationBilling` | Catalog `environment` plus Organizations with Stripe Customer, currency, default Trial days, `billingExempt`, `allowCardlessTrial`, Subscription, and Coupon |
| `billing.listAdminCoupons` | Valid Coupons in the Stripe account |
| `billing.createAdminCustomer` | Create the Stripe Customer when missing (Owner email) |
| `billing.setAdminOrganizationCurrency` | Set currency only when it is null (owned-Organization lock applies) |
| `billing.setAdminBillingExempt` | Set `billingExempt` (Skip subscription check). Does not require a Subscription |
| `billing.setAdminAllowCardlessTrial` | Set `allowCardlessTrial` (Disable credit card check). Card-on catalogs only; starts at most one cardless Trial per Stripe environment |
| `billing.createAdminSubscription` | Catalog Price plus a Trial (`trialDays`) or a Coupon (`couponId`) when there is no Subscription; no card requires one of them (Coupon at 100%) |
| `billing.applyAdminCoupon` | Apply or replace the single Coupon on the Subscription |
| `billing.removeAdminCoupon` | Clear the Coupon (never cancels) |
| `billing.cancelAdminSubscription` | Cancel immediately or at period end |

## Frontend and UI

Wrap billing-aware product routes in `BillingPaywallProvider` (it wraps
`BillingProvider`) and read state with `useSubscription`. When the Plan page
shows, the wrap adds Organization Select, the impersonation banner, and a link
to Admin panel (`/admin`) for User-role admin on their own session. Do not put
`AuthAdminRouter` inside that wrap. There is no session skip of the paywall;
`skipPlanCheck` still bypasses it for the whole app and ignores `billingExempt`.
An exempt Organization also skips the subscription query. When
`ownerMustAddPaymentMethod` is true, `BillingPaywallProvider` shows a full-page
Billing Portal prompt instead of the app.

Product chrome that depends on Capabilities wraps `EntitlementProvider` and
`EntitlementGate`. `skipPlanCheck` does not force Capabilities allowed; the
snapshot and `.requireEntitlements` remain the authority. `billingExempt`
Organizations receive every catalog Capability on that snapshot.

`@m5kdev/web-ui` provides `BillingRouter` with
`BillingPlanSelect` (1..N Plans), `BillingSinglePlanSelect`, `BillingInvoicePage`,
and `BillingBetaPage`. Pass Organization currency (frozen at create). When Trial
requires a payment method, pass `trialRequiresPaymentMethod` and the resolved
Trial Plan name so the Plan page Checkouts that Plan (default Price skips the
interval picker). `BillingPlanSelect` reads `billing.getTrialPriceId` and shows
the Price picked at sign-up instead of the default; `BillingSinglePlanSelect`
takes it as `trialPriceId`. Badge and CTA follow the displayed/selected Price:
no trial days means no “N-day Trial” / “Start Trial”; the CTA is Subscribe and
Checkout omits `trial_period_days`. `AuthPublicSignupRoute` reads `?price=`; pass
`trialPriceId` when rendering `AuthPublicSignupForm` or `AuthPublicProviders`
yourself. Billing Module admin row actions are a 3-dot menu; Skip
subscription check stays a Switch. Disable credit card check is a Switch only
when the catalog requires a card; pass `trialRequiresPaymentMethod` into
`BillingAdminRouter`.

The Admin panel keeps Users / Organizations / Waitlist. Pass optional
`extraLinks` and `extraRoutes` on `AuthAdminRouter` so Module admin hangs off
sidecar links (ADR-0021). Apps that register Billing compose:

```tsx
AuthAdminRouter({
  enableWaitlist: true,
  extraLinks: [{ label: "Billing", to: "/admin/billing" }],
  extraRoutes: BillingAdminRouter({
    plans: resolved.plans,
    trialRequiresPaymentMethod: resolved.trialRequiresPaymentMethod,
  }),
})
```

Starter does not register BillingModule; omit those props unless the app does.
Do not register admin links at import time. Compose `AuthAdminRouter` at the
router level, outside `BillingPaywallProvider`, so Admin panel is reachable
without an ACCESS_STATUS Subscription.

## Environment

`STRIPE_WEBHOOK_SECRET` for webhook verification; the Stripe client itself is
constructed in app code with your secret key. Include
`customer.subscription.trial_will_end` on the Dashboard endpoint that posts to
`POST /stripe/webhook` if you want the Trial warning.

## Related docs

- [Organization Stripe paywall and opt-in Seat billing in 0.38.0](/guides/v0.38.0-billing-org-paywall-migration)
- [Billing Coupons, sandbox Stripe Customer, and required catalog environment in 0.38.11](/guides/v0.38.11-billing-coupon-sandbox-customer-migration)
- [Organization billingExempt overlay in 0.38.13](/guides/v0.38.13-organization-billing-exempt-migration)
- [Subscription per Stripe environment in 0.38.15](/guides/v0.38.15-subscription-per-stripe-environment-migration)
- [Trial days per Price in 0.38.20](/guides/v0.38.20-billing-trial-days-per-price-migration)
- [Organization allowCardlessTrial overlay in 0.38.21](/guides/v0.38.21-organization-allow-cardless-trial-migration)
- [N Prices, frozen Organization currency, and Trial Price at start in 0.38.9](/guides/v0.38.9-billing-trial-price-catalog-migration)
- [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration)
- [Email Core Module](/modules/email)
- ADR-0021 (`docs/adr/0021-admin-panel-sidecar-module-admin.md`)
- ADR-0022 (`docs/adr/0022-complimentary-billing-admin.md`)
- ADR-0023 (`docs/adr/0023-organization-billing-exempt.md`)
- ADR-0024 (`docs/adr/0024-subscription-per-stripe-environment.md`)
- ADR-0026 (`docs/adr/0026-organization-allow-cardless-trial.md`)
- ADR-0027 (`docs/adr/0027-billing-checkout-portal-session-create-overlay.md`)
- ADR-0034 (`docs/adr/0034-billing-owns-organization-entitlements.md`)
