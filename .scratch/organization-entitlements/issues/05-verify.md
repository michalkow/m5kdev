## Parent

michalkow/m5kdev#35

## What to build

The Billing-owned Entitlement contract is demonstrable end to end on the agreed seams: service evaluation, Procedure chain, and frontend gate. No Entitlement migrations were introduced. ADR-0034 and the spec still match the behavior.

## Acceptance criteria

- [ ] Billing service, Procedure chain, and EntitlementGate tests pass on the agreed seams.
- [ ] No new Entitlement persistence or Stripe Entitlements API usage.
- [ ] One Subscription per environment still unique; Plan switch remains the second-brand path.
- [ ] Report any cross-ticket drift from ADR-0034.

## Blocked by

- michalkow/m5kdev#TBD-docs
