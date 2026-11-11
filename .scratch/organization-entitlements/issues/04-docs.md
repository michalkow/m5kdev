## Parent

michalkow/m5kdev#35

## What to build

Adopting-app developers can read how to declare Capabilities and Bundles on Plans, extend `BillingPermissionService`, consume the snapshot/`EntitlementGate`, and why `skipPlanCheck` is not a Capability grant. Starter remains Grant-only because it omits Billing.

## Acceptance criteria

- [ ] Billing module docs describe Plan `bundles`, catalog helpers, `.requireEntitlements` vs Grants, snapshot/gate states, `billingExempt` vs `skipPlanCheck`, and omitting Billing.
- [ ] Docs use glossary nouns (Capability, Entitlement, Bundle, Assignment, Grant) and point at ADR-0034.
- [ ] No instruction to adopt Stripe Entitlements or to add Entitlement tables.

## Blocked by

- michalkow/m5kdev#TBD-chain
- michalkow/m5kdev#TBD-gate
