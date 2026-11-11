# Billing owns Organization Entitlements

Published as michalkow/m5kdev#35 with the `ready-for-agent` label. GitHub Issues is the canonical tracker; this file is the local working copy.

## Problem Statement

Framework developers who ship more than one branded app over a shared Organization (a company brain plus TypeOrb-style workflows) have no first-class way to say which product Capabilities that Organization may use. Today the only commercial gate is `BillingProvider`: any caller that skips it, and any MCP/tRPC/job path that never sees it, gets the whole app after Grants. Organization flags cannot carry source, Plan packaging, or expiry. Stripe Entitlements would make Stripe the authority, which this stack refused. Developers need a typed, Organization-scoped check in the service Procedure chain and a matching frontend gate that hides chrome without treating a failed fetch as “please upgrade.”

## Solution

Billing owns Entitlements. An app-shared catalog defines Capability keys and immutable Bundles. Each Plan names 1..N Bundles. At evaluation time, a current-environment ACCESS_STATUS Subscription contributes those Bundles; `billingExempt` allows every Capability currently in the catalog; otherwise the Capability is denied. Services that check Capabilities extend `BillingPermissionService` and call `.requireEntitlements` after OrganizationActor resolution and before Grants. The webapp loads one Organization-scoped snapshot and uses `EntitlementGate` for pending, error, denied, and allowed. Apps that omit Billing keep today’s Grant-only behavior.

## User Stories

1. As a framework developer, I want Entitlements owned by Billing so that I do not register a second commercial module.
2. As a framework developer, I want no Entitlement tables so that Checkout does not wait on a second write before Capabilities appear.
3. As a framework developer, I want evaluation to use the live Subscription so that ACCESS_STATUS and Plan changes apply on the next check.
4. As a framework developer, I want the Stripe Entitlements API unused so that Stripe remains Customer, Subscription, Checkout, and Portal only.
5. As an app developer, I want Capabilities declared in app shared so that server and frontend share one catalog.
6. As an app developer, I want Bundles as immutable named revisions so that adding a Capability is a new revision, not an in-place edit.
7. As an app developer, I want a Plan to list 1..N Bundles so that TypeOrb can include brand plus brain Capabilities and an all-in-one Plan can include every included Bundle.
8. As an app developer, I want unknown Bundle names on a Plan to fail boot so that a typo cannot silently deny a product.
9. As an app developer, I want duplicate Capability keys in composed catalog fragments to fail boot so that two modules cannot silently overwrite a key.
10. As an app developer, I want a missing `bundles` list on a Plan to mean no Capabilities from that Plan so that existing catalogs keep booting and default to deny.
11. As an app developer, I want a Trial Plan to list Bundles the same way as a paid Plan so that Trial ACCESS_STATUS is not a special evaluator case.
12. As an Owner, I want Checkout of a brand Plan to unlock that Plan’s Bundles so that I can use those workflows after ACCESS_STATUS exists.
13. As an Owner, I want an all-in-one Plan to unlock every Bundle it lists so that I do not stack Checkouts.
14. As an Owner, I want switching Plan (Portal or Admin) to change Entitlements to the new Plan’s Bundles so that a second brand is a Plan change, not a second Subscription.
15. As an Owner, I want cancelling the live Subscription to drop every Bundle it listed so that access ends with ACCESS_STATUS.
16. As a Member, I want the same Organization Entitlements as every other Member so that app assignment is not a second tenancy axis.
17. As a Member with only `read` Grants, I want `typeorb.publish` still forbidden so that an Entitlement cannot widen a Grant.
18. As a Member whose Organization lacks `typeorb.publish`, I want publish denied even if I have a `publish` Grant so that a Grant cannot invent a Capability.
19. As a cookieless API caller, I want `organizationId` to name OrganizationActor as today so that Entitlements do not do a second org lookup.
20. As an MCP client, I want opted-in procedures to run `.requireEntitlements` on the same Procedure so that skipping `BillingProvider` does not grant Capabilities.
21. As a Workflow job, I want to call `BillingService.requireAll` with rebuilt OrganizationActor so that delayed work is not licensed by an enqueue-time check alone.
22. As a frontend developer, I want one snapshot query on `billing` so that I do not fetch per Capability.
23. As a frontend developer, I want the snapshot keyed by Organization so that switching Organization cannot reuse the previous allow set.
24. As a Member, I want `EntitlementGate` to show pending while the snapshot loads so that a spinner is not a denial.
25. As a Member, I want `EntitlementGate` to show error when the snapshot fails so that an outage is not an upgrade prompt.
26. As a Member, I want `EntitlementGate` to show denied when every required Capability is not allowed so that chrome and routes can hide or explain unavailability.
27. As a Member, I want `EntitlementGate` to render children only when every listed Capability is allowed so that array checks mean all.
28. As a developer using `skipPlanCheck`, I want paywall chrome skipped without granting Capabilities so that a React prop cannot mint product access.
29. As an unpaid Member, I want `BillingProvider` to keep showing Plan/Checkout chrome so that Entitlement denial is not the unpaid empty state.
30. As an AdminActor, I want `billingExempt` to skip the paywall, skip Seat billing, and allow every catalog Capability, including keys added after the flag, so that exempt Organizations are Admin god mode.
31. As an AdminActor, I want complimentary access to remain Admin create Subscription when I need a specific Plan’s Bundles rather than the full catalog.
32. As a sandbox tester, I want Assignments/evaluation scoped to the current Stripe environment so that a sandbox ACCESS_STATUS does not grant production Capabilities.
33. As a service author, I want `BillingPermissionService` with `.requireEntitlements(keys)` so that the check is a Procedure chain step, not an ad hoc boolean.
34. As a service author, I want `.requireEntitlements` after `requireAuth("organization")` and before `.access()` so that Entitlement is decided before Grant.
35. As a service author, I want Grant-only services to keep extending `BasePermissionService` so that Billing is not forced into every constructor.
36. As a service author, I want a failed Entitlement check to be `FORBIDDEN` with Entitlement context (keys and a safe reason) so that clients can distinguish it from a Grant denial.
37. As a service author, I want unknown runtime Capability keys to error rather than deny so that a typo is configuration failure, not “not entitled.”
38. As a framework developer, I want Starter to omit Billing and therefore omit Entitlement checks so that Starter behavior stays Grant-only.
39. As a docs reader, I want Billing docs to say Plan names Bundles, how to extend `BillingPermissionService`, and that `skipPlanCheck` is chrome-only.
40. As a future maintainer, I want N Subscriptions per Organization, Member app assignment, metering, string globs, and per-Capability overrides left out so that v1 stays one Plan, booleans, and read-time derivation.

## Implementation Decisions

- Entitlements are a Billing feature, not a Backend Module and not Kernel infrastructure. `BillingPermissionService` lives in Billing and extends `BasePermissionService`. Kernel `base/` does not import Billing.
- App shared owns the catalog: `defineCapabilities` / `defineBundles` (or equivalent typed helpers) plus each `StripePlan.bundles` list. The same catalog is imported by frontend bindings. `BillingModule` receives the composed catalog with existing resolved Plans.
- Boot-validate: duplicate Capability keys fail; Plan Bundle names must exist; production and sandbox Plan lists are each validated. A Plan with omitted `bundles` contributes an empty list (deny unless `billingExempt`).
- No schema/migration work. Evaluation reads current-environment ACCESS_STATUS (`active` | `trialing` | `past_due`) plus `Organization.billingExempt` plus the Plan’s Bundles expanded through the catalog.
- `BillingService` exposes `evaluate`, `requireAll`, and `snapshot` for an OrganizationActor. `requireAll` succeeds only when every listed Capability is allowed. `snapshot` returns the allowed set (or per-key booleans) for the catalog, with safe reasons only — no Plan prices, Stripe ids, or Admin-only fields.
- Safe denial reasons distinguish at least: no live Subscription, missing Capability on the current Plan, and unknown Capability (the last is an error, not a denial). `billingExempt` does not produce those denials; it allows every catalog key.
- `.requireEntitlements(keys)` is a Permission Procedure builder method on `BillingPermissionService`. It requires OrganizationActor already on the chain, calls `this.service.billing.requireAll`, aborts on Err. Services that use it declare `billing` in their service map. Jobs call `requireAll` directly.
- Entitlement `FORBIDDEN` uses error context that names the kind as Entitlement and the Capability keys. Grant `FORBIDDEN` stays unchanged (no Entitlement context). Do not use `PAYMENT_REQUIRED`.
- tRPC: organization-scoped `billing` snapshot query. Input follows existing `organizationId` Actor naming. Query keys include Organization id.
- Frontend: provider/hooks in frontend billing beside `BillingProvider`; `EntitlementGate` in web-ui billing. Compose in `Providers.tsx`. `skipPlanCheck` and `billingExempt` still skip paywall chrome; the snapshot remains authoritative for Capabilities.
- One Subscription per Organization per environment unchanged. A second brand is a Plan switch. Cancel drops every Bundle that Plan listed.
- Boolean Capabilities only. Array means all. No string globs. No Member-specific Entitlements.

## Testing Decisions

A good test asserts Entitlement behavior through public Billing and Procedure interfaces: given this Organization (ACCESS_STATUS Plan, exempt, or neither) and these Capability keys, `requireAll` / snapshot / `.requireEntitlements` / `EntitlementGate` allow, deny, pending, or error. Tests do not inspect derived caches or private union helpers.

Seams:

1. `BillingService` (highest): extend existing Billing service tests that already boot Kernel, Auth, Email, Billing, and PostgreSQL. Cover ACCESS_STATUS Plan Bundles, Trial Plan Bundles, canceled/no Subscription deny, `billingExempt` allows the full catalog including a Capability added only in the catalog, environment isolation, unknown key is an error, `requireAll` all-vs-missing, snapshot shape is Member-safe.
2. `BillingPermissionService` Procedure chain: a small service in the Billing test suite chains `requireAuth("organization")`, `.requireEntitlements`, and `.access()`. Assert Entitlement denial happens without Grant success; Grant denial still happens when Entitled; missing OrganizationActor fails like other auth steps.
3. Frontend `EntitlementGate` / provider: follow web-ui Billing paywall tests. Pending vs error vs denied vs allowed; Organization id in the query; `skipPlanCheck` does not force allowed.

Prior art: Billing service PostgreSQL tests; `BasePermissionService` Procedure tests; `BillingPaywallProvider` tests.

## Out of Scope

- EntitlementModule, persisted Assignment tables, Stripe Features/Entitlements API
- Multiple live Subscriptions or subscription items per Organization per environment
- Member↔app assignment, numeric quotas/metering, per-Capability overrides, string globs
- Replacing `BasePermissionService` in Kernel; putting `.requireEntitlements` on `base/` Procedure
- Teaching Starter to check Entitlements (Starter omits Billing)
- Changing Seat billing, Checkout, Portal, Coupon, or `billingExempt` Admin UX beyond Entitlement evaluation
- Migrating existing consumer apps’ Plans onto Bundles (framework ships the contract; adopting apps map their catalogs)

## Further Notes

Glossary terms: Capability, Entitlement, Bundle, Assignment (derived, not a table), Plan, Subscription, billingExempt, Grant, OrganizationActor. Decision record: ADR-0034. Research-only write-up `docs/organization-entitlements-research.md` is not the spec; where it conflicts, ADR-0034 wins (Billing-owned, derived, exempt = full catalog, one Subscription).
