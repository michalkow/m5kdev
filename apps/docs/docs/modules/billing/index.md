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
| `@m5kdev/web-ui` | `BillingRouter`, plan select pages, invoice page, beta page. |

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
on `organizations.stripe_customer_id`. `users.stripe_customer_id` is removed.
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
- `constructEvent`, `processEvent`, `syncStripeData` — webhook verify and re-sync.
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

## Frontend and UI

Wrap billing-aware routes in `BillingProvider` and read state with
`useSubscription`. `@m5kdev/web-ui` provides `BillingRouter` with
`BillingPlanSelect` (1..N Plans), `BillingSinglePlanSelect`, `BillingInvoicePage`,
and `BillingBetaPage`. Pass Organization currency (frozen at create). When Trial
requires a payment method, pass `trialRequiresPaymentMethod` and the resolved
Trial Plan name so the Plan page Checkouts that Plan (default Price skips the
interval picker). `skipPlanCheck` still bypasses the paywall.

## Environment

`STRIPE_WEBHOOK_SECRET` for webhook verification; the Stripe client itself is
constructed in app code with your secret key. Include
`customer.subscription.trial_will_end` on the Dashboard endpoint that posts to
`POST /stripe/webhook` if you want the Trial warning.

## Related docs

- [Organization Stripe paywall and opt-in Seat billing in 0.38.0](/guides/v0.38.0-billing-org-paywall-migration)
- [N Prices, frozen Organization currency, and Trial Price at start in 0.38.9](/guides/v0.38.9-billing-trial-price-catalog-migration)
- [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration)
- [Email Core Module](/modules/email)
