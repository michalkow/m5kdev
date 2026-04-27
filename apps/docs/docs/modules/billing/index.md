---
sidebar_position: 3
---

# Billing module

The billing module connects shared billing contracts, backend Stripe integration,
frontend subscription state, and billing UI pages.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Billing schemas, types, and utilities. |
| `@m5kdev/backend` | Billing tables, repository, service, tRPC procedures, HTTP routes, and module registration. |
| `@m5kdev/frontend` | Billing provider and subscription hooks. |
| `@m5kdev/web-ui` | Plan selection, invoices, and billing route components. |

## Documentation status

This page is scaffolded. Fill it by documenting Stripe setup, app configuration,
service methods, frontend subscription flow, and UI integration.
