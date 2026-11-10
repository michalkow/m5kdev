# Billing owns Organization Entitlements

Organization product availability is an Entitlement (a Capability key), not a Grant, Plan name, or feature flag. Billing owns it: a Plan names 1..N Bundles; a live ACCESS_STATUS Subscription implies those Bundles at evaluation time; `billingExempt` allows every Capability currently in the app catalog. There is no Entitlement Backend Module, no Entitlement tables, and no Stripe Entitlements API. Guards use OrganizationActor already on the Procedure. This extends [ADR-0017](0017-billing-org-paywall-seat-billing-opt-in.md) and [ADR-0023](0023-organization-billing-exempt.md).

## Considered Options

- **EntitlementModule (omittable Core, independent of Billing)** — rejected: Capabilities come from Subscriptions; a second module would re-solve a Plan the Billing row already names.
- **Stripe Entitlements / Features as source of truth** — rejected: the catalog is app-owned next to `StripePlansConfig`; Stripe remains Customer, Subscription, Checkout, Portal.
- **Persisted Assignment rows** — rejected: they cache `subscription.plan → plan.bundles`. Read-time derivation avoids webhook lag after Checkout. Bundle revisions stay immutable; adding a Capability is a new revision and a Plan map bump, which is a live upgrade.
- **Kernel `.requireEntitlements` on `base/` Procedure** — rejected: Base cannot depend on Billing. `BillingPermissionService` extends `BasePermissionService` and adds the chain method; only services that check Capabilities extend it and declare `billing` in their service map. Jobs call `BillingService.requireAll`. Starter stays on `BasePermissionService`.
- **Double gate (paywall AND Entitlements as separate authorities)** — rejected: skipping `BillingProvider` used to mean every Capability. The server check is the authority; `skipPlanCheck` is chrome only.
- **N Subscriptions per Organization per environment** — rejected for v1: keep `(referenceId, environment)` uniqueness. A brand Plan lists that brand plus shared brain Bundles; all-in-one lists every included Bundle. A second brand is a Plan switch, not a second Checkout.
- **`billingExempt` skips chrome but grants no Capabilities** — rejected: exempt is AdminActor god mode for that Organization and tracks the catalog, including keys added after the flag. It is not `skipPlanCheck`.
- **Default-allow / string globs (`resources.*`)** — rejected: missing Assignment is deny; guards name concrete Capability keys; catalog fragments are the family.
- **Member↔app assignment, numeric quotas, per-Capability overrides** — rejected for v1. Every Member uses the Organization's Entitlements; Grants still stop publish; Seat billing stays Billing.

## Consequences

- App shared defines Capabilities and Bundles; each `StripePlan` lists `bundles`. Unknown Bundle names and duplicate Capability keys fail boot. Frontend reuses that catalog.
- `.requireEntitlements` runs after `requireAuth("organization")` and before `.access()`. Array means all keys. Denial is `FORBIDDEN` with Entitlement context (keys, safe reason), not a bare Grant `FORBIDDEN` and not `PAYMENT_REQUIRED`.
- `BillingProvider` still shows Plan/Checkout when there is no ACCESS_STATUS and the Organization is not exempt. Product chrome uses a `billing` snapshot query keyed by Organization, with pending / error / denied / allowed. `EntitlementGate` lives in web-ui billing.
- Apps that omit Billing have no Entitlement checks (today's full access after auth/Grants). Trial uses the Trial Plan's `bundles` like any other Plan.
- One live Plan per environment: cancelling that Subscription drops every Bundle it listed. Shared brain survives only if the replacement Plan still names the brain Bundle.
- Adding a Capability to the catalog immediately grants it to every `billingExempt` Organization.
