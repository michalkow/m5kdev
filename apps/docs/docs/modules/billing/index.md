---
sidebar_position: 3
---

# Billing module

The billing module is the Stripe subscription stack: plan configuration, checkout
and billing portal sessions, webhook-driven subscription sync, and plan-selection
UI.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `StripePlan` / `StripePlansConfig` types, billing schema, plan utilities. |
| `@m5kdev/backend` | `BillingModule`: `subscriptions` table, repository, `BillingService`, Stripe webhook routes, tRPC procedures. |
| `@m5kdev/frontend` | `BillingProvider` and `useSubscription`. |
| `@m5kdev/web-ui` | `BillingRouter`, plan select pages, invoice page, beta page. |

## Plan configuration

Plans are plain objects shared between backend and frontend:

```ts
import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";

const plans: StripePlan[] = [
  {
    name: "pro",
    priceId: "price_...",
    annualDiscountPriceId: "price_...",
    freeTrial: { days: 14 },
    limits: { seats: 5 },
  },
];
```

`StripePlansConfig` separates `production` and `sandbox` price ids and can name a
`trialPlanName`.

## Backend

### Registration

```ts
import Stripe from "stripe";
import { BillingModule } from "@m5kdev/backend/modules/billing/billing.module";

backendApp.use(
  new BillingModule({ stripe: new Stripe(process.env.STRIPE_SECRET_KEY!) }, { plans, trial })
);
```

Grants default to `defaultBillingGrants` (user: own; admin/org owner: all).

### Service

`BillingService` implements the sync-from-Stripe pattern:

- `createUserCustomer` / `createUserHook` — create the Stripe customer when a
  user signs up.
- `createCheckoutSession` / `createBillingPortalSession` — start Stripe-hosted
  flows.
- `getActiveSubscription`, `listInvoices` — read state for the current actor.
- `constructEvent`, `processEvent`, `syncStripeData` — verify webhook signatures
  and re-sync the local `subscriptions` row from Stripe as the source of truth.

### HTTP routes

| Route | Purpose |
| --- | --- |
| `GET /checkout/:priceId` | Redirect to a Stripe Checkout session |
| `GET /portal` | Redirect to the Stripe billing portal |
| `GET /success` | Post-checkout landing that triggers a sync |
| `POST /webhook` | Stripe webhook (raw body, verified with `STRIPE_WEBHOOK_SECRET`) |

### tRPC procedures

| Procedure | Description |
| --- | --- |
| `billing.getActiveSubscription` | Current subscription or `null` |
| `billing.listInvoices` | Stripe invoices for the current customer |

## Frontend and UI

Wrap billing-aware routes in `BillingProvider` and read state with
`useSubscription`. `@m5kdev/web-ui` provides `BillingRouter` with
`BillingPlanSelect`, `BillingSinglePlanSelect`, `BillingInvoicePage`, and
`BillingBetaPage`.

## Environment

`STRIPE_WEBHOOK_SECRET` for webhook verification; the Stripe client itself is
constructed in app code with your secret key.
