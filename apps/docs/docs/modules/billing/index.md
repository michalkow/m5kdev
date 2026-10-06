---
sidebar_position: 3
---

# Billing module

The billing module is the Stripe paywall: Plan catalog, Checkout, Billing Portal,
webhook-driven Subscription sync, and plan-selection UI. The Customer is the
Organization (ADR-0017).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `StripePlan` / `StripePlansConfig` types, billing schema, plan utilities. |
| `@m5kdev/backend` | `BillingModule`: `subscriptions` table, repository, `BillingService`, Stripe HTTP, tRPC procedures. |
| `@m5kdev/frontend` | `BillingProvider` and `useSubscription`. |
| `@m5kdev/web-ui` | `BillingPaywallProvider`, `BillingRouter`, plan select pages, invoice page, beta page, `BillingAdminRouter`. |

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
  payment method. Requires a `trialEnding` template on `EmailModule`. Stripe
  fires that event about three days before Trial end. See
  [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration).

### HTTP routes

Mounted under `/stripe` by `BillingModule`.

| Route | Purpose |
| --- | --- |
| `GET /stripe/checkout/:priceId` | Redirect to a Stripe Checkout session (Owner) |
| `GET /stripe/portal` | Redirect to the Stripe Billing Portal (Owner) |
| `GET /stripe/success` | Post-checkout landing that triggers a sync |
| `POST /stripe/webhook` | Stripe Subscription webhook (raw body, verified with `STRIPE_WEBHOOK_SECRET`). This is Billing, not [Inbound callback](/modules/webhook). |

### tRPC procedures

Organization-scoped.

| Procedure | Description |
| --- | --- |
| `billing.getActiveSubscription` | Current accessible Subscription or `null`. Includes `ownerMustAddPaymentMethod` for the Owner after a consumed cardless Trial when the catalog requires a card, the switch is off, status is `trialing`, and there is no default payment method |
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
