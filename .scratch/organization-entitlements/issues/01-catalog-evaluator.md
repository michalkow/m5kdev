## Parent

michalkow/m5kdev#35

## What to build

An Organization with a current-environment ACCESS_STATUS Subscription is entitled to the Capabilities on that Plan’s Bundles. A `billingExempt` Organization is entitled to every Capability in the app catalog. Any other Organization is denied. App shared declares Capabilities and Bundles; each Plan lists Bundle names; Billing evaluates that catalog at read time with no Entitlement tables.

## Acceptance criteria

- [ ] App-shared catalog helpers define Capabilities and immutable Bundles; each Plan may list 1..N Bundle names.
- [ ] Duplicate Capability keys or unknown Bundle names fail boot; omitted Plan `bundles` contributes nothing.
- [ ] `BillingService.requireAll` / `evaluate` / `snapshot` derive from ACCESS_STATUS (including Trial) plus `billingExempt`.
- [ ] No Subscription and not exempt → deny; unknown Capability key → error, not deny.
- [ ] `billingExempt` allows every catalog Capability, including keys not listed on any Plan.
- [ ] Sandbox ACCESS_STATUS does not grant production Capabilities.
- [ ] Snapshot is Member-safe (no Plan prices, Stripe ids, or Admin-only fields).
- [ ] Covered on the existing Billing service PostgreSQL test seam.

## Blocked by

None — can start immediately.
