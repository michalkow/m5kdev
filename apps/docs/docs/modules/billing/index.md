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
| `@m5kdev/web-ui` | `BillingRouter`, plan select pages, invoice page, beta page, `BillingAdminRouter`. |

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
            { priceId: "price_usd_month", interval: "month", intervalCount: 1, unitAmount: 14900 },
            { priceId: "price_usd_quarter", interval: "month", intervalCount: 3, unitAmount: 29800 },
            { priceId: "price_usd_year", interval: "year", intervalCount: 1, unitAmount: 89400 },
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

`trialPlanName` is a currency → Plan name map. Omit it for Checkout-only
catalogs. When `trialRequiresPaymentMethod` is false (the default), each Trial
Plan Product must set `defaultPriceId`; Kernel starts Trial on that Price at
Organization create. When it is true, there is no Trial until Checkout:
`defaultPriceId` skips the Plan page; otherwise the Owner picks a Price id then
Checkouts. After convert, interval change is Billing Portal.

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

- `createOrganizationHook` — Stripe Customer on the Organization; optional Trial on the default Price for Organization currency when a card is not required.
- `createCheckoutSession` / `createBillingPortalSession` — Stripe-hosted flows
  (Owner only; Checkout refused while an open Subscription exists). When Trial
  requires a payment method, Checkout sets `trial_period_days` and
  `payment_method_collection: always`.
- `getActiveSubscription`, `listInvoices` — Organization-scoped reads. Access
  includes `active`, `trialing`, and `past_due`.
- `adjustBillableSeats` — Seat billing quantity (no-op when Seat billing is off).
- `cancelOrganizationSubscription` — cancel in Stripe, keep the Customer.
- AdminActor Billing Module admin (ADR-0022): list Organizations and Coupons,
  create a Stripe Customer, set Organization currency when it is null, create a
  Subscription on a catalog Price with either a Trial (Admin-entered days,
  pre-filled from the Trial Plan's `freeTrial.days`) or a Coupon, apply /
  replace / remove one Coupon on an existing Subscription (Price unchanged),
  and cancel. Without a payment method on the Customer, create requires a Trial
  or a 100%-off Coupon (Stripe cannot charge a first invoice without one). An
  Admin Trial ends like catalog Trial: Stripe cancels without a card. The page
  shows the catalog environment (Production / Sandbox).
  Coupons are listed from the Stripe account; create them in the Dashboard.
  Removing a Coupon never cancels.
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
| `billing.getActiveSubscription` | Current accessible Subscription or `null` |
| `billing.listInvoices` | Stripe invoices for the Organization Customer |

AdminActor (`adminProcedure`). Input includes `organizationId` because the
AdminActor is not in that Organization.

| Procedure | Description |
| --- | --- |
| `billing.listAdminOrganizationBilling` | Catalog `environment` plus Organizations with Stripe Customer, currency, default Trial days, Subscription, and Coupon |
| `billing.listAdminCoupons` | Valid Coupons in the Stripe account |
| `billing.createAdminCustomer` | Create the Stripe Customer when missing (Owner email) |
| `billing.setAdminOrganizationCurrency` | Set currency only when it is null (owned-Organization lock applies) |
| `billing.createAdminSubscription` | Catalog Price plus a Trial (`trialDays`) or a Coupon (`couponId`) when there is no Subscription; no card requires one of them (Coupon at 100%) |
| `billing.applyAdminCoupon` | Apply or replace the single Coupon on the Subscription |
| `billing.removeAdminCoupon` | Clear the Coupon (never cancels) |
| `billing.cancelAdminSubscription` | Cancel immediately or at period end |

## Frontend and UI

Wrap billing-aware routes in `BillingProvider` and read state with
`useSubscription`. `@m5kdev/web-ui` provides `BillingRouter` with
`BillingPlanSelect` (1..N Plans), `BillingSinglePlanSelect`, `BillingInvoicePage`,
and `BillingBetaPage`. Pass Organization currency (frozen at create). When Trial
requires a payment method, pass `trialRequiresPaymentMethod` and the resolved
Trial Plan name so the Plan page Checkouts that Plan (default Price skips the
interval picker). `skipPlanCheck` still bypasses the paywall.

The Admin panel keeps Users / Organizations / Waitlist. Pass optional
`extraLinks` and `extraRoutes` on `AuthAdminRouter` so Module admin hangs off
sidecar links (ADR-0021). Apps that register Billing compose:

```tsx
AuthAdminRouter({
  enableWaitlist: true,
  extraLinks: [{ label: "Billing", to: "/admin/billing" }],
  extraRoutes: BillingAdminRouter({ plans: resolved.plans }),
})
```

Starter does not register BillingModule; omit those props unless the app does.
Do not register admin links at import time.

## Environment

`STRIPE_WEBHOOK_SECRET` for webhook verification; the Stripe client itself is
constructed in app code with your secret key. Include
`customer.subscription.trial_will_end` on the Dashboard endpoint that posts to
`POST /stripe/webhook` if you want the Trial warning.

## Related docs

- [Organization Stripe paywall and opt-in Seat billing in 0.38.0](/guides/v0.38.0-billing-org-paywall-migration)
- [Billing Coupons, sandbox Stripe Customer, and required catalog environment in 0.38.11](/guides/v0.38.11-billing-coupon-sandbox-customer-migration)
- [N Prices, frozen Organization currency, and Trial Price at start in 0.38.9](/guides/v0.38.9-billing-trial-price-catalog-migration)
- [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration)
- [Email Core Module](/modules/email)
- ADR-0021 (`docs/adr/0021-admin-panel-sidecar-module-admin.md`)
- ADR-0022 (`docs/adr/0022-complimentary-billing-admin.md`)
