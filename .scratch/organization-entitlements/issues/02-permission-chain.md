## Parent

michalkow/m5kdev#35

## What to build

Service authors who need Capability checks extend `BillingPermissionService` and chain `.requireEntitlements` after OrganizationActor resolution and before Grants. Skipping `BillingProvider` no longer grants those Capabilities on that Procedure. Grant-only services stay on `BasePermissionService`. Jobs call `BillingService.requireAll`.

## Acceptance criteria

- [ ] `BillingPermissionService` extends `BasePermissionService` and adds `.requireEntitlements(keys)` on the Procedure builder.
- [ ] The step requires OrganizationActor; the array means every listed Capability.
- [ ] Entitlement denial is `FORBIDDEN` with Entitlement context (keys, safe reason), distinguishable from Grant `FORBIDDEN`.
- [ ] An entitled Member still needs the resource Grant; a Grant cannot invent a Capability.
- [ ] Kernel `base/` does not import Billing; Starter services do not extend `BillingPermissionService`.
- [ ] Covered by a Billing test-suite Procedure chain (auth → entitlements → access).

## Blocked by

- michalkow/m5kdev#TBD-evaluator
