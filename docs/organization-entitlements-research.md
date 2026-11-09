# Organization entitlements for a shared company brain

Research council synthesis · 6 November 2026 · Recommendation, not an accepted ADR or implementation specification

## Recommendation

Build an omittable **EntitlementModule** in the framework, independent of Billing. Give it a typed capability catalog in code, Organization assignments in PostgreSQL, a deterministic evaluator, and a small service guard interface. Expose one Organization-scoped snapshot to frontend hooks and route/component guards. Keep resource Grants unchanged. This is the coordinator's recommendation, supported by both completed briefs and the repository's explicit module/service composition conventions. [R1], [R2], [R3]

The central rule is: **each source contributes access; removing that source removes only its contribution.** The knowledge app and TypeOrb can both supply `resources.analyze`. Cancelling TypeOrb must leave that capability enabled when the knowledge app still supplies it. Resources remain owned by the same Organization throughout. That follows the user's shared-brain requirement and the Organization-level entitlement pattern documented by OpenFGA. [U1], [S1]

Start with booleans, versioned app bundles, source ownership, validity periods, privileged overrides, audit, and backend/frontend guards. Defer numeric allowances, metering, Member app assignment, and a general policy language. Stripe can later map ordinary subscription state into assignments; **do not adopt Stripe Entitlements**, including as a required integration source. This scope is a design recommendation, not a requirement imposed by an external standard. [U1], [S2], [S3]

## Council and evidence

Each researcher received the same context, worked independently in the shared checkout, and was instructed to inspect relevant repository code, use web search and primary sources, and return a cited brief without writing files. The coordinator read both completed briefs, checked selected local implementation details, and synthesized this document. No second research round was run to resolve disagreements.

| Requested member | Provider / catalog model | Reasoning setting | Outcome |
| --- | --- | --- | --- |
| Sol 6.1 | `codex` / `gpt-6.1-sol` | `reasoningEffort: high` | Completed cited brief |
| Grok 4.7 | `cursor` / `grok-4.7` | `reasoning_effort: high` | Completed cited brief |
| Claude Opus 5.5 | `claudeAgent` / `claude-opus-5-5` | `effort: high` | Failed after repeated API errors; no completed brief |

There is agreement between **two completed researchers**, not three-model consensus. The third perspective is missing. The findings below distinguish observed repository behavior, cited external behavior, and proposed design. Proposed names and TypeScript APIs do not exist yet and have not been compiled.

## Requirements and current constraints

The user wants two branded apps over one company brain: the markdown knowledge app and TypeOrb drafting/publishing. Adopting the second app must add workflows over existing Resources, processing, and analysis. Entitlements belong to the Organization, work without Stripe, and must be pleasant for framework developers to use. Member-specific app assignments remain undecided. [U1]

The repository already establishes the following:

- Organization is the tenancy unit; User is global identity; MemberId attributes Organization-scoped activity. Grants describe resource authorization, with canonical Actions such as `read`, `write`, `delete`, and `publish`. [R2]
- Services own business rules and authorization. Repositories own persistence; transports wire inputs and results; jobs call services. Modules and dependencies are explicitly composed. [R1], [R3]
- `ServerResultAsync<T>` is `Promise<Result<T, ServerError>>`, not the neverthrow `ResultAsync` class. Examples should therefore use ordinary `await` and Result handling. [R4]
- MCP calls are opted-in tRPC procedures, with service Grant checks preserved. Older ADRs describing unguarded separate MCP paths are superseded. [R5]
- Billing is an Organization Stripe paywall. Its local model has one Subscription per Organization/environment, and current synchronization lists one subscription and selects its first item. It cannot simply be assumed to support independently purchased app subscriptions or several subscription items. [R6], [R7], [R8]
- `BillingProvider` currently replaces application content when there is no active subscription and uses a four-hour query stale time. That is an existing billing behavior, not an appropriate entitlement guard contract. [R9]

The researchers did not locate the described Resources implementation or the two branded apps in the inspected framework paths. Shared ownership is therefore a requirement of this proposal, not a verified property of current product code. [U1]

## What the system should mean

The following terminology is proposed. Existing Grant, Access, Plan, and Subscription meanings stay as defined in the glossary. [R2]

| Concept | Proposed responsibility |
| --- | --- |
| Capability | Stable developer-facing key for an ability, such as `resources.analyze` |
| Catalog | Code-defined keys, value kinds, safe metadata, and validation |
| Bundle revision | Immutable set of capabilities supplied together, such as TypeOrb revision 1 |
| Assignment | One source's contribution to one Organization, with validity and provenance |
| Override | Privileged explicit allow or deny for one Organization/capability |
| Effective entitlement | Result of resolving that Organization's active assignments and overrides |
| Grant | Existing rule for a Member's action on resources; unchanged |
| Feature flag | Separate release, experiment, or operational availability decision |

Do not call entitlement assignments “Grants,” reuse `AccessModule`, or turn a plan name into a guard key. Organization entitlements and resource Grants answer different questions. OpenFGA demonstrates Organization-derived feature entitlement relationships; Cedar demonstrates principal/action/resource policy decisions. Neither requires replacing the existing Grant system to implement this proposal. [R1], [R2], [S1], [S4]

For a protected operation, the proposed decision is the conjunction of current Actor validity, required Organization capabilities, resource Grants, and business preconditions. Quota availability is another condition only if a separate quota system exists. A capability allow cannot widen a resource Grant. [R1], [R2], [S1]

### One brain, multiple workflows

Proposed packaging:

- Knowledge bundle: `apps.knowledge`, `knowledge.edit`, `resources.read`, `resources.analyze`.
- TypeOrb bundle: `apps.typeorb`, `typeorb.draft`, `typeorb.publish`, `resources.read`, `resources.analyze`.

App keys govern entry/navigation and may be combined with operation keys where the workflow requires them. Shared Resources operations check shared capability keys; they do not require a particular branded app. A bundle contributes capabilities without owning the corresponding Resource rows. Both bundles operate on the same Organization. [U1], [S1]

Prefer shared backend authorities for Organization identity, Resources, and entitlements initially. Sharing package code while maintaining separate Organization and Resource stores would fail the stated requirement. Separate servers can be considered later, but require explicit ownership of the canonical stores and a consistent catalog; two independently writable evaluators are not the recommended starting point. This is an architectural recommendation based on the shared-data requirement. [U1], [R2]

## Why build a small resolver

Both completed briefs recommend a local PostgreSQL-backed resolver. The assessment below is qualitative; no performance benchmark or vendor cost comparison was conducted.

| Approach | Evidence and assessment |
| --- | --- |
| Existing Organization flags | Convenient storage, but an array does not itself supply source ownership, expiry, audit, or typed decisions. Keep it out of the commercial entitlement contract. The glossary already distinguishes dedicated billing settings from flags. [R2], [R10] |
| Framework-owned resolver | Fits existing persistence, Actor, service, and Result conventions. Recommended because those mechanisms already exist and the requested authority must be independent. [R1], [R3], [R4], [U1] |
| OpenFeature as the main contract | Useful provider-independent typed evaluation and diagnostic concepts. Its abnormal-evaluation behavior returns caller-supplied defaults, which this proposal should not copy for protected operations. Use a catalog-owned decision contract with explicit errors. [S5] |
| OpenFGA / Cedar adoption | Useful modeling and deny-precedence examples. Adopting either would add a separate authorization model to a problem the existing Grants plus a small entitlement resolver can address. Defer unless relationship or policy requirements outgrow that design. [S1], [S4], [R2] |
| Entitlement/metering platform | OpenMeter distinguishes boolean, static, and metered entitlements. Borrow that separation; operational adoption is not needed for the proposed boolean first version. [S2] |
| Stripe Entitlements | Its product-feature/customer model is useful comparative evidence, but adopting it conflicts with the user's requested independent authority. Exclude it from the implementation recommendation. [U1], [S3] |

## Catalog and bundles

**Proposal:** define capabilities in shared TypeScript code. Persist assignments and overrides, not a second operator-editable dictionary of feature definitions. Literal keys and indexed access types can preserve type inference; TypeScript's `satisfies` supports shape validation without unnecessarily widening inferred types. [S6], [S7]

Illustrative API, not implemented:

```ts
export const resourceCapabilities = defineCapabilities({
  "resources.read": booleanCapability(),
  "resources.analyze": booleanCapability(),
});

export const knowledgeCapabilities = defineCapabilities({
  "apps.knowledge": booleanCapability(),
  "knowledge.edit": booleanCapability(),
});

export const typeOrbCapabilities = defineCapabilities({
  "apps.typeorb": booleanCapability(),
  "typeorb.draft": booleanCapability(),
  "typeorb.publish": booleanCapability(),
});

export const capabilities = composeCapabilities(
  resourceCapabilities,
  knowledgeCapabilities,
  typeOrbCapabilities,
);

export const bundles = defineBundles(capabilities, {
  "knowledge@1": [
    "apps.knowledge", "knowledge.edit",
    "resources.read", "resources.analyze",
  ],
  "typeorb@1": [
    "apps.typeorb", "typeorb.draft", "typeorb.publish",
    "resources.read", "resources.analyze",
  ],
});
```

Recommended constraints, derived from explicit composition and safe evaluation goals: [R1], [S5], [S6]

- All v1 capability definitions are boolean and default to denied. Free/core availability is an explicit baseline assignment, not a permissive default selected by a call site.
- Preserve fragment boundaries during composition so duplicate keys can be rejected. Spreading objects first loses overwritten-key evidence before a validator can inspect it.
- Unknown typed keys fail compilation; unknown runtime keys and invalid relevant persisted values return configuration errors. Neither becomes allowed.
- Register definitions explicitly at composition time. No global singleton catalog or import-time self-registration.
- Validate bundles, references, and active revisions. Do not expose unsupported numeric kinds in v1's public API merely to reserve a future design.
- Keep keys and meanings stable. A breaking semantic change gets a new key and an explicit transition, not an invisible rename.
- Shared contracts contain safe labels and descriptions. Source credentials, contract notes, prices, and internal audit details remain server-side.

**Recommendation on versioning:** each assignment should retain an immutable snapshot of its expanded capabilities and bundle revision/hash. Keep the code-defined revision as the readable packaging contract. This combines Sol's immutable revisions with Grok's write-time expansion: historical assignments remain explainable when a later deployment changes a bundle. A change to existing Organizations is an explicit reassignment operation with audit. The precise storage representation remains an implementation decision. [R1], [S1]

Rolling deployments need a compatibility window. Keep old guarded keys valid until older workers and clients have drained; diagnose retired assignment entries without treating them as new active capabilities. A stale client cannot invent a capability by including a string in a request. This is a proposed evolution policy; neither brief validated a release-transition implementation. [S5], [R1]

## Assignments, overrides, and deterministic evaluation

The proposed logical records are:

- **Assignment:** Organization, environment, source namespace and stable source ID, immutable capability snapshot/bundle revision, startsAt, optional expiresAt, revocation state, and attribution.
- **Override:** Organization, environment, capability, allow/deny, effective interval, mandatory reason, and privileged author.
- **Change history:** old/new state, responsible actor/source, timestamp, correlation ID, and resulting Organization entitlement revision.
- **Revision:** monotonic Organization/environment change marker for writes; time-driven transitions additionally require a next-transition timestamp.

These are conceptual records, not migration files or a required four-table schema. Store structured payloads with the repository's PostgreSQL/JSONB conventions. Preserve MemberId when attributing Organization-scoped human activity; a platform AdminActor may instead have UserId attribution without Membership, and an adapter has system/source attribution. [R1], [R2]

Use a trusted source identity such as `(namespace, sourceId)` inside the Organization/environment. Source IDs identify the actual contract, manual allocation, or future subscription object, not just the bundle name. Two independent contracts for the same bundle must remain independently revocable. Source writers may replace only their own desired assignment set. They must not create overrides or edit other sources. This is the recommended consequence of source-owned contributions. [S1], [S8]

Evaluate at one captured time using half-open intervals, `startsAt <= now < expiresAt`, ignoring revoked contributions. For a known boolean capability:

1. An active privileged deny returns denied.
2. Otherwise an active privileged allow returns allowed.
3. Otherwise any active enabling assignment returns allowed.
4. Otherwise return denied.

No ordinary assignment carries a global deny. Cancellation is removal of a contribution. Overrides are a separately authorized control; where overlapping overrides are permitted, deny wins and provenance identifies the determining override. Cedar's forbid-over-permit behavior informs this rule, but the override lifecycle and restricted writers are local design choices. [S4]

Make expiry effective at read time. A sweeper may help administrative reporting but cannot be required to end access. Write source changes, audit, and revision together in one transaction. Duplicate source replacements should be idempotent. Begin with environment isolation for **all** assignments, including manual ones; administrators can deliberately provision both environments. This is a conservative recommendation extending the repo's production/sandbox billing separation rather than copying Stripe-specific environment fields into the core. [R1], [R2], [R7]

For the two-app example, revoking the TypeOrb source removes `apps.typeorb`, drafting, and publishing if no other source supplies them. Shared analysis remains enabled through the knowledge source. Resources and historical outputs are not deleted by that evaluation. Retention and read/export policy remain separate product decisions. [U1], [S1]

## Backend developer experience

**Proposal:** expose an injected read/guard interface, separately from source-management methods:

```ts
// Hypothetical methods, bound to the app's catalog type.
evaluate(actor, key): ServerResultAsync<EntitlementDecision>;
require(actor, key): ServerResultAsync<true>;
requireAll(actor, keys): ServerResultAsync<true>;
snapshot(actor, keys): ServerResultAsync<EntitlementSnapshot>;
```

For v1, a Decision has the boolean value, a stable safe reason, evaluatedAt, nextTransitionAt, and Organization/catalog revisions. A successful evaluation that denies is `ok(decision)`. `require` translates denial into an expected `ServerError`. Database/configuration failures remain errors and must be distinguishable from absence of an entitlement. Administrative diagnostics can include determining assignment IDs; the ordinary Member snapshot must not leak source or contract details. This borrows detailed-result ergonomics from OpenFeature while preserving local Result conventions and stricter error handling. [S5], [R4]

Place the check in the service that owns the operation. Inject `entitlements` through that service's existing dependency map. A minimal imperative use inside a service operation is:

```ts
// Hypothetical entitlement API; existing neverthrow result convention.
const access = await this.service.entitlements.requireAll(actor, [
  "apps.typeorb",
  "typeorb.publish",
]);
if (access.isErr()) return err(access.error);

// Continue the owning operation, including its resource Grant checks.
```

For existing service Procedures, add a `.use()` step after Organization Actor resolution and appropriate resource authorization, before the side effect:

```ts
// In an existing service Procedure chain; the entitlement method is proposed.
.use("entitlements", ({ ctx }) =>
  this.service.entitlements.requireAll(ctx.actor, [
    "apps.typeorb",
    "typeorb.publish",
  ])
)
```

The repository already supports this extension point and demonstrates resource loading plus `.access({ action: "publish", entityStep: "post" })`. No new base-service inheritance layer or trivial pass-through service is necessary. Consider dedicated Procedure sugar only after repeated usage proves that it removes meaningful boilerplate. Keep tRPC/MCP thin and continue unwrapping through the existing Result convention. [R1], [R3], [R5], [R11]

The resolver must use the Organization from trusted Actor resolution, not a frontend-supplied arbitrary ID. Input `organizationId` can name the Organization through the existing live-membership resolution path; it does not itself establish authority. A valid Organization entitlement never bypasses a Closed User/Organization or missing Membership. [R2], [R12]

For jobs, carry minimal IDs/input and rebuild current authority at execution. Recheck the required entitlement and Grants before delayed publishing or another meaningful side effect. A check at enqueue time is not an indefinite license to execute. Cleanup and repair paths need explicitly defined authority rather than a generic `skipEntitlements` escape hatch. [R1], [R12]

## Frontend developer experience

**Proposal:** bind the catalog once in shared app integration code and use one Organization-scoped query for each app's declared capability set. Hooks, route guards, and buttons consume that result; they do not issue one request per capability. Put hooks/provider in `@m5kdev/frontend`, and HeroUI/React Router presentation helpers in `@m5kdev/web-ui`, following the existing package responsibilities. Compose the provider centrally in `Providers.tsx` and route wrappers in `Router.tsx`. [R1], [R2]

Illustrative APIs:

```tsx
// Hypothetical typed binding; created once by the consuming app.
export const { EntitlementProvider, useEntitlement, EntitlementGate } =
  createEntitlementBindings(capabilities);

// A feature component consumes the existing shared snapshot.
const publishing = useEntitlement("typeorb.publish");

<EntitlementGate
  capability="typeorb.publish"
  pending={<AppLoader />}
  error={<AvailabilityRetry />}
  denied={<PublishingUnavailable />}
>
  <PublishButton />
</EntitlementGate>
```

Return explicit `pending`, `error`, `denied`, and `allowed` states. A failed query must not be rendered as “upgrade required,” and a denial need not have a payment remedy. Safe reasons can distinguish missing capability, expiry, and administrative restriction; a resource-Grant denial remains a separate explanation. [S5], [R1]

The snapshot query input must include Organization ID and any response-shaping capability selection. Do not reuse the previous Organization's allowed state during a switch. TanStack Query documents that query dependencies belong in query keys; explicitly passing the Organization through the existing tRPC query input provides that separation. [S9]

Invalidate the specific snapshot after administrative changes and source updates. Use Auth-mediated Server events to notify other Members about changes they did not await, and refetch on reconnect/focus as recovery. Send identifiers/revisions, not full internal entitlement snapshots: the existing bus does not enforce Grants on payloads. [R1], [R13]

Cap client freshness at upcoming starts/expiries and use a bounded fallback refresh policy. A proposed initial fallback is a 60-second refresh while the app is active, plus reconnect/focus and event invalidation; this is a starting UX policy, not a measured security SLA. `staleTime` by itself is not a periodic refetch timer. At a known expiry, stop presenting the old allow while refreshing. Backend guards remain authoritative regardless of client cache. [S9], [R9], [R13]

Guard app routes without trapping Organization selection, support, billing management, or recovery behind a missing app entitlement. Navigation visibility, disabled controls, and denied-route explanations should use the same decision source. These are proposed UX rules, not permission enforcement substitutes. [R1], [U1]

## Billing integration must remain optional

The dependency direction should be **billing adapter → entitlement assignment management**. The entitlement evaluator, catalog, and guards must not import Stripe or require Billing registration. Manual provisioning and nonbilling product onboarding must work first. [U1], [R1]

A future adapter can map ordinary provider prices, subscription items, and explicitly selected access statuses to local bundle revisions. Those mappings belong in integration configuration, outside capability definitions. There is no need to create Stripe Features, query active Stripe Entitlements, or listen to Stripe entitlement-summary events. This intentionally rejects that portion of Grok's brief to honor the user's requirement. [U1], [R8], [S3]

Stripe documents duplicate deliveries and lack of guaranteed event ordering. The proposed integration should verify signatures, durably receive/deduplicate events, and use them as reconciliation signals. Retrieve authoritative current subscription state, serialize the fetch-and-apply sequence per affected source/Organization or use a sound fencing mechanism, then atomically replace only the source-owned assignments. A current-state fetch alone does not prevent an older concurrent worker from committing later. Retry failures and periodically reconcile independently of webhooks. [S8]

Deduplication identity should include provider account, environment, and event ID. Map external Customer/object identities explicitly to Organizations, never by email. Account for every applicable subscription/item when packaging requires it. The existing Billing sync's one-subscription/first-item shape needs a separate change before it can support independent app purchases; a new entitlement table does not solve that commercial limitation. [R2], [R7], [R8], [S8]

**Adoption must address the existing whole-app paywall.** If an entitled Organization still sits inside a provider that demands a Stripe Subscription, independent access will remain blocked. For apps adopting this model, use entitlements as the availability authority and let Billing manage payment/checkout/portal responsibilities. Preserve the old paywall behavior for consumers that do not adopt the new model. This requires a deliberate integration/API decision, rather than silently rewriting Billing globally. [R6], [R9], [U1]

Keep `billingExempt`'s existing meaning. It must not implicitly unlock every present and future app. Existing exempt customers that should retain access need explicit assignments during adoption. [R2]

## Limits, meters, caching, and operational guarantees

Both researchers recommend boolean availability first. OpenMeter's separation of boolean, static, and metered entitlements supports keeping these mechanisms distinct. A boolean entitlement cannot enforce an AI spending budget. [S2]

When concrete requirements arrive, add typed configuration values with an explicit merge rule per key. Maximum may fit alternative allowances; sum may fit purchased additive packs; a set union may fit allowed options. No universal numeric rule is justified by the current product description. Represent unlimited explicitly. Do not duplicate the existing Billing seat model without deciding which system owns seat enforcement. [S2], [R2], [R6]

If hard quotas are required, add an atomic reservation/consumption service with idempotent operation IDs, period rules, and retry/release/settlement behavior. A read-then-later-increment guard can race. PostgreSQL row locks can serialize conflicting writers, but every relevant writer must follow the same protocol. Metering remains outside the v1 recommendation. [S10]

**Recommended v1 backend cache policy:** read authoritative PostgreSQL state for each guarded service operation, with at most bounded operation-local reuse. Do not add cross-request or cross-node allow caches until measurement justifies them. Expiry is evaluated directly, not scheduled. [R1], [S10]

The proposed revocation guarantee is that a new evaluation reading the primary's current committed state observes committed revocation. An evaluation in an older transaction snapshot or work already authorized may not. Rechecking before an external side effect narrows the interval but does not make an external publish atomic with a database revocation. Avoid promising instantaneous cancellation of in-flight work. [S10]

Later caches must include Organization/environment/catalog identity, have a hard freshness bound, and expire at relevant time transitions. Invalidation alone is insufficient: Redis Pub/Sub is at-most-once, and the framework's Server events provide no replay and can be in-process when Redis is absent. UI recovery can use refetch; authoritative guards should not depend on receiving a bus message. [S11], [R13]

Shared-data confidentiality remains a resource authorization concern. Source retrieval, search, analysis, generation, and export must respect the caller's applicable Grants; cached summaries and derived drafts need an explicit audience policy. An app entitlement supplies another workflow over authorized data and cannot itself authorize disclosure to all Organization Members. Neither brief validated the actual Resources retrieval/indexing paths. [R1], [R2], [U1]

## Administration, invariants, and delivery scope

Recommend platform AdminActor authority for manual assignments and overrides initially, enforced through the existing canonical Grant actions and custom-role conventions. Organization Members can read sanitized availability; Organization Owners cannot self-assign arbitrary paid capabilities. A permitted product onboarding operation may supply a fixed free bundle, but it must not accept unrestricted capability keys from a client. Source integrations receive constrained source-writing authority, not generic administrative override powers. [R1], [R2]

Recommended placement is `packages/backend/src/modules/entitlement/`, with generic contracts in commons and frontend support in the existing frontend packages. Core Modules are omittable in this architecture. An experimental separate package is viable, but neither persistence nor commercial provisioning belongs in `base/`. The user asked for reusable framework DX, making an omittable Core Module the preferred eventual home. This is a proposal, not a change to the current core-module catalog. [R1], [R2]

Recommended acceptance invariants:

1. Billing and Redis may be absent while manual provisioning and backend checks work.
2. Knowledge plus TypeOrb yields the union of capabilities over one Organization.
3. Removing either source leaves the other's shared capabilities intact, regardless of insertion order.
4. Validity boundaries and privileged deny precedence are deterministic.
5. Unknown or malformed evaluated capabilities never allow protected operations.
6. Source writers cannot modify other sources or overrides; repeated replacement is idempotent.
7. Changes, audit, and revision commit together; rollback leaves no half-applied source state.
8. Frontend Organization switching cannot reuse the previous Organization's allowed result.
9. Direct service calls, tRPC, MCP, and jobs receive the intended guard behavior.
10. Expiry/revocation works without a sweeper or successful notification delivery.
11. Catalog composition rejects duplicate keys before flattening fragments.
12. In-flight job behavior, deployment skew, and future concurrent reconciliation are tested against their stated guarantees.

These are proposed behavioral tests derived from the model and the documented transport, Result, transaction, and event constraints. They are not tests added or run by this research task. [R1], [R4], [R5], [R13], [S8]

Recommended delivery sequence:

- **First version:** boolean catalog; immutable bundle snapshots; assignments, starts/expiry, and overrides; audit/revision; authoritative service evaluator; manual provisioning; frontend snapshot and guards; demonstrable two-app union without Billing.
- **Adoption:** backfill intended access for existing Organizations, replace the adopting apps' blanket subscription gate, exercise cancellation/read-only behavior, and establish diagnostics. Do not unexpectedly lock existing customers merely because the new default is denied.
- **Later integrations:** ordinary Stripe subscription mapping/reconciliation, configuration limits required by a real operation, measured cache improvements.
- **Only when required:** Member app assignment, consumption accounting, complex policy expressions, editable catalog publication, or independent entitlement infrastructure.

This sequence deliberately excludes schema migration generation. Implementation will need the project's migration workflow; this task creates only the requested research document. [R1], [U1]

## Agreement, disagreements, and coordinator decisions

Both completed researchers support Organization-level capabilities, shared Resources ownership, code-defined typed keys, source-owned union, expiry, service enforcement, a batched frontend snapshot, boolean v1, deferred metering, and an omittable Core Module. Their supporting evidence overlaps across repository composition/Grants and OpenFeature/Cedar modeling; Sol additionally uses OpenFGA and OpenMeter. [R1], [R2], [S1], [S2], [S4], [S5]

| Topic | Sol's position and evidence | Grok's position and evidence | Synthesis |
| --- | --- | --- | --- |
| Defaults | False for booleans; unknown/invalid values are explicit errors. Uses OpenFeature as contrast. [S5] | Allows catalog-level default-allow for baseline features; rejects bad writes but would ignore unknown evaluated entries. [S5], [R2] | Default denied; explicit baseline assignments. Distinguish retired data from a requested unknown key, and fail invalid relevant evaluation. |
| Deny authority | Separate privileged administrative overrides. [S4] | Deny can be an assignment effect and wins across sources. [S4] | Reserve deny for privileged overrides; ordinary cancellation only removes contributions. |
| Bundle history | Immutable referenced revisions. [S1], [R1] | Expand into source-owned capability rows at write time. [R1] | Retain immutable expanded snapshot plus revision/hash; no silent changes from a later catalog edit. Both are defensible storage approaches. |
| Future Stripe | Map ordinary provider state into independent assignments. [S8], [R8] | Use Stripe active-entitlement reconciliation as a feeder. [S3], [S8] | Sol's direction meets the user constraint. Do not use Stripe Entitlements. |
| Whole-app paywall | Must change for adopting apps or it blocks independent access. [R9] | Leave existing paywall intact alongside capability gates. [R9] | Replace blanket subscription availability checks in adopting apps; preserve legacy behavior elsewhere. |
| Environments | Environment belongs to assignments/source identity. [R2], [R7] | Only Stripe rows scoped; manual/bundle assignments shared across environments. [R2], [R7] | Scope every assignment. Cross-environment provisioning must be explicit. |
| Later numeric merge | Per-capability semantics; max/sum/union may each fit. [S2] | Prefers max, with later overrides. [S10] | Defer implementation and decide per capability. Locking evidence does not justify a universal merge policy. |
| Stale reconciliation | Serialize/fence source reconciliation. [S8] | Fetch current state and replace source rows, described as making order harmless. [S8] | Fetch alone is insufficient under concurrent workers; serialize the full operation or design fencing. |

These are design judgments, not questions definitively answered by vendor documentation. No additional research round was used to make disagreement disappear. Grok's claim that an app-local prototype necessarily forces copied evaluators was also not adopted: shared code can be extracted later; the framework destination is preferred because of the requested reuse, not because extraction is impossible. [U1], [R1]

## Gaps and decisions still needed

Neither completed brief establishes the actual branded-app deployment topology, authenticates the company-brain Resource model, or benchmarks the proposed evaluator. There is no compiled proof of generic catalog inference through the framework router and frontend bindings. The failed third researcher leaves these findings with two independent perspectives.

The coordinator additionally identifies areas not adequately settled by either brief; these are open design work, not new researched findings:

- **Existing customer consolidation:** if the current apps already have separate Organizations, merging memberships, identities, resources, and entitlements requires a migration plan. Matching email domains alone is not an established ownership rule.
- **Catalog/deploy transitions:** define old-worker compatibility, snapshot/hash retention, rollback behavior, and what happens when a retired key remains in historical assignments.
- **Management concurrency:** decide optimistic concurrency/version checks for two administrators changing overrides or source state at once.
- **Audit recovery:** decide audit retention, restore/reconciliation behavior after a database backup restore, and whether stronger tamper evidence is required.
- **Billing outage policy:** choose how long last-known billing assignments remain valid, how renewal expiry/grace works, and who can recover access. Offline evaluation does not itself define commercial grace.
- **Composite workflows:** decide whether an already-running generation may finish after access ends, and distinguish that from later scheduled publication.

Before implementation, settle these product choices:

1. The initial capability list and baseline access when neither app is enabled.
2. Whether every Member can enter every enabled app, or later needs an app assignment.
3. Historical read/export/retention rules after cancellation.
4. The canonical Organization/Resources/entitlement authority shared by both brands.
5. Administrative override powers, customer-facing denial copy, and a measurable revocation target.
6. Commercial packaging when Stripe arrives: one suite subscription, several items, or independent subscriptions.

The recommended first implementation can proceed without introducing per-Member app assignments, metering, or a billing provider. The invariants that should be present immediately are source ownership, explicit expiry, resource-permission separation, and shared Organization identity. [U1], [R1], [S1]

## Merged sources

Only sources present in the completed research briefs are used below. Local references were selectively verified during synthesis. External sources support the linked factual behavior; recommendations remain the council/coordinator's design judgments.

### User requirement

[U1]: #requirements-and-current-constraints

- **U1:** User instructions in this conversation: one shared Organization brain for the knowledge app and TypeOrb; own billing-independent entitlement system; developer-friendly framework guards. Not an external source.

### Repository sources

[R1]: ../AGENTS.md
[R2]: ../GLOSSARY.md
[R3]: ../packages/backend/src/base/base.service.ts
[R4]: ../packages/backend/src/base/base.dto.ts
[R5]: adr/0028-mcp-tools-are-opted-in-trpc-procedures.md
[R6]: adr/0017-billing-org-paywall-seat-billing-opt-in.md
[R7]: ../packages/backend/src/modules/billing/billing.db.ts
[R8]: ../packages/backend/src/modules/billing/billing.repository.ts
[R9]: ../packages/frontend/src/modules/billing/components/BillingProvider.tsx
[R10]: ../packages/backend/src/modules/auth/auth.db.ts
[R11]: ../packages/backend/src/base/base.procedure.ts
[R12]: ../packages/backend/src/base/base.actor.ts
[R13]: adr/0010-kernel-owns-server-events.md

- [R1 — Architecture and workflow instructions][R1]
- [R2 — Domain glossary: tenancy, Grants, modules, Billing, frontend package responsibilities][R2]
- [R3 — Base services and explicit dependency maps][R3]
- [R4 — ServerResult and ServerResultAsync definitions][R4]
- [R5 — MCP calls are opted-in tRPC procedures][R5]
- [R6 — Billing is an Organization Stripe paywall][R6]
- [R7 — Subscription persistence and Organization/environment uniqueness][R7]
- [R8 — Billing synchronization: listStripeSubscriptions and syncStripeData][R8]
- [R9 — BillingProvider gate and query policy][R9]
- [R10 — Auth Organization and Membership persistence][R10]
- [R11 — Service Procedure extension and authorization interfaces][R11]
- [R12 — Actor definitions and resolution][R12]
- [R13 — Server event audience, delivery, and reconnect semantics][R13]

Additional supporting implementation inspected by the briefs: [Starter PostsService](../apps/starter/server/src/modules/posts/posts.service.ts), [Posts transport](../apps/starter/server/src/modules/posts/posts.trpc.ts), [BillingModule composition](../packages/backend/src/modules/billing/billing.module.ts), and [Billing service](../packages/backend/src/modules/billing/billing.service.ts).

### External primary sources

[S1]: https://openfga.dev/docs/modeling/advanced/entitlements
[S2]: https://openmeter.io/docs/billing/entitlements/entitlement
[S3]: https://docs.stripe.com/billing/entitlements
[S4]: https://docs.cedarpolicy.com/auth/authorization.html
[S5]: https://openfeature.dev/specification/sections/flag-evaluation/
[S6]: https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html
[S7]: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
[S8]: https://docs.stripe.com/webhooks
[S9]: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
[S10]: https://www.postgresql.org/docs/current/explicit-locking.html
[S11]: https://redis.io/docs/latest/develop/pubsub/

- [S1 — OpenFGA: modeling Organization-derived entitlements][S1]
- [S2 — OpenMeter: boolean, static, and metered entitlement types][S2]
- [S3 — Stripe Entitlements, comparative evidence only; excluded from the proposed implementation][S3]
- [S4 — Cedar: authorization algorithm, deny precedence, and diagnostics][S4]
- [S5 — OpenFeature: typed evaluation, detailed results, and fallback semantics][S5]
- [S6 — TypeScript: indexed access types][S6]
- [S7 — TypeScript 4.9: satisfies operator][S7]
- [S8 — Stripe: webhook verification, delivery, duplicate handling, and ordering][S8]
- [S9 — TanStack Query: query keys and changing dependencies][S9]
- [S10 — PostgreSQL: explicit locking and concurrent access][S10]
- [S11 — Redis: Pub/Sub delivery semantics][S11]

Other sources cited by Grok's brief but not relied on for the final recommendation: [OpenFeature spec source](https://github.com/open-feature/spec/blob/main/specification/sections/01-flag-evaluation.md), [OpenFeature types](https://openfeature.dev/specification/types), [OpenFeature introduction](https://openfeature.dev/docs/reference/intro), [Fowler's feature-toggle taxonomy](https://www.martinfowler.com/articles/feature-toggles.html), [Stripe Feature object](https://docs.stripe.com/api/entitlements/feature), [Stripe active-entitlement listing](https://docs.stripe.com/api/entitlements/active-entitlement/list), and [Stripe event behavior](https://docs.stripe.com/events/how-events-work). The final design does not depend on the Stripe entitlement APIs or their object limits.
