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
import { createBackendApp } from "@m5kdev/backend/app";
import { BillingModule } from "@m5kdev/backend/modules/billing/billing.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";

createBackendApp(config, [
  new EmailModule(templates),
  new BillingModule({ stripe: new Stripe(process.env.STRIPE_SECRET_KEY!) }, { plans, trial }),
]);
```

Grants default to `defaultBillingGrants` (user: own; admin/org owner: all).

`BillingModule` `dependsOn` Email. Register `EmailModule` in the same
`createBackendApp` call or boot fails with
`Backend module "billing" is missing required dependency "email"`. Auth already
requires Email, so most apps only need to keep that registration.

### Service

`BillingService` implements the sync-from-Stripe pattern:

- `createUserCustomer` / `createUserHook` — create the Stripe customer when a
  user signs up.
- `createCheckoutSession` / `createBillingPortalSession` — start Stripe-hosted
  flows.
- `getActiveSubscription`, `listInvoices` — read state for the current actor.
- `constructEvent`, `processEvent`, `syncStripeData` — verify webhook signatures
  and re-sync the local `subscriptions` row from Stripe as the source of truth.
- Trial cancel warning — on `customer.subscription.trial_will_end`, after sync,
  Billing emails a Billing Portal CTA when Stripe would cancel for a missing
  payment method. Requires a `trialEnding` template on `EmailModule`. Skip
  (success) if the template is unregistered, the User has no email, a default
  payment method exists, or `missing_payment_method` is not `"cancel"`. Stripe
  fires that event about three days before Trial end; there is no Workflow
  clock. See
  [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration).

### HTTP routes

| Route | Purpose |
| --- | --- |
| `GET /checkout/:priceId` | Redirect to a Stripe Checkout session |
| `GET /portal` | Redirect to the Stripe billing portal |
| `GET /success` | Post-checkout landing that triggers a sync |
| `POST /webhook` | Stripe Subscription webhook (raw body, verified with `STRIPE_WEBHOOK_SECRET`). This is Billing, not [Inbound callback](/modules/webhook). |

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
constructed in app code with your secret key. Include
`customer.subscription.trial_will_end` on the Dashboard endpoint that posts to
`POST /webhook` if you want the Trial warning.

## Related docs

- [Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration)
- [Email Core Module](/modules/email)
