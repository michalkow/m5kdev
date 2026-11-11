## Parent

michalkow/m5kdev#35

## What to build

Members load one Organization-scoped Entitlement snapshot from Billing. UI chrome and routes can render pending, error, denied, or allowed. `skipPlanCheck` still skips paywall chrome and does not mark Capabilities allowed. Unpaid Organizations still see Plan/Checkout from `BillingProvider`.

## Acceptance criteria

- [ ] Organization-scoped `billing` snapshot query; query identity includes Organization id.
- [ ] Frontend billing provider/hooks plus web-ui `EntitlementGate` with pending, error, denied, and allowed.
- [ ] Gate array means every listed Capability; a failed snapshot is error, not denied.
- [ ] Switching Organization does not reuse the previous snapshot.
- [ ] `skipPlanCheck` does not force Capabilities allowed; `billingExempt` snapshot is the full catalog.
- [ ] Covered by web-ui billing tests in the style of the existing paywall provider tests.

## Blocked by

- michalkow/m5kdev#TBD-evaluator
