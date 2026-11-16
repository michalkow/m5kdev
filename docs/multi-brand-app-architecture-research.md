# Two branded products in one application: research council synthesis

Date: 2026-11-16. Status: architecture research and recommendations, not an accepted ADR or an implementation.

## Recommendation

**Introduce an explicit, app-owned product experience selected by the domain. Keep the existing Organization Entitlements as the authority for available capabilities, and Grants as the authority for Member actions.** All three researchers agree on that separation. This is a design inference grounded in the existing Organization/Billing model, cookie and authentication constraints, and server authorization guidance. [R1], [R2], [S1], [S4], [S6]

For Gastro Raider and Horeka AI, the intended result is:

- Enter through Gastro Raider's configured domain: retain its branding, navigation, onboarding and workflows.
- Enter through Horeka AI's configured domain: retain its branding, navigation, onboarding and workflows.
- Buying access to both changes available capabilities; it does not choose a third interface or unexpectedly change the brand.
- A combined customer can explicitly open the other product if that is the desired journey. [R1], [R2]

Those are proposed behaviors, not observations of the existing products. This checkout contains m5kdev and Starter; neither product's actual repository, exact domains, workflows, customer records or commercial configuration was audited. Brand names and identifiers below are working labels from the conversation, not verified deployment configuration.

## What is already decided in this repository

[ADR-0034][R1] is the current authority. The older organization-entitlements research is superseded wherever it differs. Billing derives Organization Entitlements from the current-environment accessible Subscription's Plan: **Plan → immutable Bundle revisions → boolean Capability keys**. There is no independent Entitlement module or assignment table. A protected operation needs an OrganizationActor, the required Entitlements, and the relevant resource Grant. [R1], [R2], [R3]

One Organization has one Subscription row per Stripe environment. A combined offering is a Plan containing the required Bundles; obtaining the second offering means a Plan switch, not another concurrent Checkout. Replacing the Plan removes capabilities that the replacement does not include. A billing-exempt Organization receives every capability in the app catalog, including keys added later. Every Member shares the Organization's Entitlements; Grants still constrain actions and resources. [R1], [R3], [R4]

The glossary explicitly distinguishes a Capability from a brand or app name. Preserve stable ability keys and named Bundle revisions; do not add brand booleans to the entitlement evaluator as a way to select a shell. [R2], [R5]

The wrapper presently assumes one public experience in several places:

| Area | Verified current shape | Consequence for this proposal |
| --- | --- | --- |
| App metadata | One name, web/API URL pair, logo and tagline | Multiple experiences need explicit configuration |
| Starter frontend | One app name and app URL passed through centralized Providers | Resolve the experience before public/auth rendering |
| Auth | One API base URL and a web/API trusted-origin pair | Additional public origins require integration work |
| HTTP shell | Default CORS origin is the configured web origin | Configure permitted browser origins deliberately |
| Billing | Checkout/Portal URLs and the success redirect use singular environment URLs | Preserve the initiating experience across billing |
| Billing customization | Constructor-level session-parameter overlays | Per-request branding is not already available |

These are integration findings, not instructions to replace the Kernel's composition model. [R6], [R7], [R8], [R9], [R10], [R11]

## Keep five concepts separate

The following is the council's recommended model, not a new glossary decision. Organization, Capability, Entitlement and Grant retain their existing meanings. “Experience” is a proposed app-level name. [R1], [R2]

| Concept | Question answered | Proposed source |
| --- | --- | --- |
| Product experience | Which product identity and journey did the visitor enter? | Configured domain → experience definition |
| Organization | Whose records and Memberships are involved? | Validated OrganizationActor |
| Entitlement | Which abilities are available to this Organization? | Existing Billing derivation |
| Grant | May this Member perform this action on these resources? | Existing service/resource authorization |
| Rollout control | Which release or experiment variant is enabled? | Separate deployment/experiment configuration |

OpenFeature evaluation context can carry application, host and user targeting information. That supports rollout targeting; it does not establish a purchased right. Recommendation: keep rollout switches outside commercial authority and require Entitlements for protected paid operations regardless of the rollout state. [S5], [R1]

### Why capabilities should not choose the entire interface

This recommendation follows from three existing cases. Before authentication there may be no Organization to evaluate, but login and signup already need branding. A combined Plan makes both products' abilities available, so capabilities do not identify which experience the visitor intended. A billing-exempt Organization has every catalog key, producing the same ambiguity. A Plan change should therefore update availability inside a stable experience rather than select a new shell. [R1], [R3]

| State on a product domain | Recommended behavior |
| --- | --- |
| Anonymous visitor | That product's public and authentication experience |
| Relevant capabilities allowed | That experience's authorized workflows |
| No relevant entitlement | Same branding, with an access explanation or appropriate commercial path |
| Combined Plan | Same experience; optionally an explicit link to the other product |
| Billing-exempt | Same experience, all catalog capabilities available, Grants still enforced |
| Entitlement request pending or failed | Explicit pending/error state; do not mislabel a failure as an upgrade requirement |

The frontend already exposes pending, error, reason and allowed state. The table proposes how to consume it; the frontend snapshot remains a presentation aid rather than server authorization. [R1], [R12]

## Minimal app-level composition

**Recommendation:** resolve the experience once from deployment-owned configuration, compose the relevant shell and route tree, then authenticate and resolve the Organization. Paid workflows retain their existing Entitlement and Grant checks. Keep branching at composition seams instead of repeatedly checking the hostname inside feature components. [R1], [R7], [S4]

An illustrative shared contract could be:

```ts
// Proposed app-level vocabulary; these are not existing framework APIs.
type ExperienceId = "gastro-raider" | "horeka-ai";

interface ExperienceConfig {
  readonly id: ExperienceId;
  readonly displayName: string;
  readonly webOrigin: string;
  readonly apiOrigin: string;
  readonly themeKey: string;
  readonly copyNamespace: string;
  readonly emailProfile: string;
}

// Deployment supplies verified origins and an exact host-to-id index.
// Shells, routes and onboarding implementations are composed in the app.
type ExperienceByHost = ReadonlyMap<string, ExperienceId>;
```

This is conceptual, not a complete security implementation. Host parsing, ports, aliases, HTTPS enforcement and trusted-proxy behavior must be handled at the request boundary. The configuration contains canonical origins; it does not accept arbitrary client URLs or cache an Organization's entitlement snapshot. [S1], [S2], [S3]

Recommended ownership:

- **Shared app contracts:** experience identifiers, canonical origins and serializable presentation settings.
- **Frontend composition:** shells, route composition, navigation, assets, copy and onboarding; keep global providers in Providers and route trees in Router.
- **Shared workflows:** reuse components, hooks and services where the business process is actually the same.
- **Distinct workflows:** preserve explicit screens and owning service methods rather than force them through a growing set of brand conditions.
- **Communications:** choose sender/template/link profiles from a validated experience identifier when the communication originates.
- **Availability:** continue using concrete Capability keys and the existing Billing guards. [R1], [R2], [R7], [R12]

An experience may offer a subset of routes despite the Organization owning additional capabilities. Conversely, exposing a route or opening another domain must not create a right to use it. Authorization must run on every protected server operation. Do not use Plan names as frontend permission checks. [R1], [S4]

Recommendation: apply experience-specific defaults when creating the relevant settings, then preserve customer choices. Visiting the other domain should not silently overwrite an existing Organization's preferences. The actual defaults requiring preservation remain unknown because neither product was audited.

## One codebase versus one frontend or deployment

The council agrees these are separate choices. Branding alone does not require separate databases, and a shared codebase does not require merging existing Organizations. The preferred topology remains conditional on workflow, isolation and release requirements. [S6], [R2]

| Option | Recommended fit | Tradeoff |
| --- | --- | --- |
| One frontend build with domain-selected composition | Most workflows overlap | Simpler release artifact, more runtime composition |
| Two frontend entry points over shared services/backend | Navigation, journeys or delivery requirements differ substantially | Clearer frontend boundaries, more delivery configuration |
| Shared source with separate backend/database deployments | A confirmed operational or isolation requirement calls for it | Greater isolation with additional coordination and consolidation work |

Sol and Opus explicitly lean toward separate frontend entry points when the workflows materially differ. Grok emphasizes bundle separation and release cadence as reasons to choose them. This is a difference in emphasis, not evidence that either topology fits these unexamined products. Vite supports multiple HTML build entry points; separate frontend packages are another possible composition. A single SPA can also use lazy loading, so it need not eagerly download every other product's screen. [S7]

**Recommendation for the brainstorm:** design two explicit experiences over shared domain modules first. Choose one build or two only after comparing the actual route and workflow inventories. Shared backend and shared data require their own agreement about Organization identity and record visibility. [R1], [R2], [S6]

## Presentation context versus a security boundary

The proposed experience is presentation context. It selects a journey; it does not authenticate a User, establish Membership, assign a record to an Organization or grant a capability. Existing API-key and MCP paths must continue to resolve Organization scope and enforce Entitlements/Grants without depending on a particular browser's brand journey. Those HTTP clients may have an API hostname, but that is not proof of which product shell a person entered. [R1], [R2], [S4]

If the requirement is stronger—some records or operations must remain product-specific even for an Organization that buys both—model that requirement explicitly. Recommendation: put resource ownership and its constraints in the domain/services/queries, rather than infer record ownership from the current host. Tenant context must remain enforced across database, storage, caches and workers. [S6]

The briefs differ about the ADR consequence: Opus treats a server-enforced product boundary as grounds to revisit ADR-0034; Sol distinguishes product-data isolation from a change to paid availability. Synthesis: document any new boundary explicitly. Reopen ADR-0034 when it changes Entitlement semantics, exemption, or Member-to-product assignment; an additional resource-ownership rule can instead belong in a separate domain decision while retaining Billing's authority. This distinction is a recommendation, not a resolved repository decision. [R1], [R2], [S4], [S6]

## Authentication, domains, caches and background work

### Host resolution and canonical links

Express can derive hostname from forwarded headers when proxy trust is enabled, so the trusted ingress must overwrite client-supplied forwarding headers. Recommendation: use an exact allowlist of normalized deployment hosts, reject unknown production hosts, and construct absolute URLs from the selected canonical configuration. Never turn an arbitrary Host or Origin header into an email link or trusted origin. [S2], [S3]

Better Auth documents a dynamic base URL with allowed hosts and explicit forwarded-header trust. Sol also located that support in the pinned 1.7.3 source; the repository pins Better Auth 1.7.3. However, the local wrapper currently sets a static base URL and trusted-origin list after spreading options. Recommendation: extend the real integration seam deliberately instead of assuming the upstream option already works through the wrapper. [S1], [S8], [R8], [R13]

### Shared identity does not imply shared browser sessions

Cookies cannot span unrelated registrable domains. Better Auth documents cross-site-cookie limitations and recommends suitable same-site or reverse-proxy arrangements. Recommendation: consider a same-origin API/auth proxy on each product domain, backed by the shared system, with browser sessions scoped to each domain. A central redirect-based sign-in flow is a separate design if seamless SSO is required; broadening cookie attributes does not provide it. [S9], [S10]

Register the actual OAuth callback addresses used by the chosen topology and preserve validated post-login destinations. Exact matching of registered redirect URIs and preventing open redirectors are OAuth security requirements. A central auth topology may use central callbacks; it does not necessarily need one callback on every brand domain. [S11], [S12]

### Caches and query identity

HTTP caching varies at minimum by method and target URI, and header-based variation uses Vary. Set-Cookie alone is not a prohibition on caching. Recommendation: preserve host/experience separation in branded HTML/config caches and scope private application caches to Organization and other relevant authorization dimensions. Keep entitlement responses private. Add experience to query keys only when the returned data actually varies by experience; the proposed Entitlement result remains Organization-scoped because the evaluator is unchanged. [S13], [R3], [R12]

### Workers and outbound branding

Workers do not inherit the initiating browser context. Recommendation: carry minimal validated Organization/resource identifiers and an experience identifier where branding matters; resolve canonical email sender, templates and links explicitly. Re-establish tenant scope and any time-sensitive authorization needed when work executes. This preserves the existing rule to avoid serializing request/session objects into jobs. [S6], [R14]

For scheduled events and Stripe webhooks, there may be no initiating product visit. Choose a durable communication policy, such as the relevant resource's product or an explicit billing communication profile. All three briefs leave that policy unresolved. Do not silently use the last visited brand or guess from email address.

## Billing: two brands fit; two independent commercial lifecycles may not

The current Plan/Bundle design supports a product-specific Plan and a combined Plan. Recommended packaging can include shared Bundles plus each offering's abilities. Keeping both on a combined Plan preserves ADR-0034; independently cancelling one product while retaining the other must correspond to an intentional replacement Plan and its Bundle set. [R1], [R5]

For paid customers, existing policy routes Plan/interval/card changes through Billing Portal. Its allowed transitions must agree with the app catalog. Recommendation: ensure the other product's entry point does not present a purchase path that unexpectedly replaces the current Plan and removes existing capabilities. Define upgrades, downgrades and proration before introducing a combined offering. [R15], [S14]

**Trials are an additional constraint:** the catalog selects one Trial Plan per currency, whose Bundles determine trial access. Different product-specific signup trials in the same currency are not just a second logo or different default screen. They may require changing the trial-selection contract while still keeping one Subscription per Organization/environment. [R16], [R17], [R1]

### “Totally separate branding” extends beyond the application shell

Stripe Checkout supports per-session branding, including a display name. Its SDK documents that this override does not replace the business identity everywhere; subsequent billing artifacts can retain account-level branding. Portal configurations vary selected content and behavior, while its business name and appearance use account settings and one custom portal domain is permitted per account. Recommendation: audit these surfaces separately instead of treating a Checkout logo as complete brand separation. [S15], [S16], [S17], [S18]

| Surface | What this research establishes |
| --- | --- |
| App, authentication pages and app-sent emails | Can be composed per experience; integration work remains |
| Checkout | Per-session branding options exist upstream |
| Portal | Some configuration varies, but business identity/branding have account-level constraints |
| Invoices, receipts and Stripe email | Do not assume Checkout overrides propagate |
| Legal seller and Stripe account identity | Must be established from the actual businesses |

Stripe documents separate accounts for independently operated businesses/projects and account association with a business entity; its multi-entity billing guidance addresses separate legal entities. Their actual status is unverified here. Recommendation: settle merchant/account identity before consolidating billing. Separate Stripe accounts would require an account-aware integration and do not make concurrent subscriptions supported under the present local contract. This is a vendor constraint and architecture question, not a legal assessment of these products. [S19], [S20], [R4]

### The current overlay is not a per-request solution

ADR-0027 intentionally provides a static constructor-level bag of Checkout/Portal parameters. A runtime experience-aware session customization callback would change that contract. Recommendation: design and record the extension explicitly, including validated return destinations and preserved reconciliation; do not claim a dynamic branding hook exists today. Stripe metadata by itself is not a demonstrated callback-correlation mechanism in this checkout. The current success handler redirects to a single configured web URL. [R10], [R11]

## What remains unchanged, and what requires another decision

**Recommendation:** retain Billing ownership, boolean capabilities, immutable Bundle revisions, Organization-scoped derivation, Entitlement checks before Grants, and the current one-subscription rule. An app-level experience map does not require a second Entitlement module, assignment table or host-based capability evaluator. [R1], [R3], [R5]

Explicitly revisit ADR-0034 if requirements demand concurrent product subscriptions in one Organization/environment, Member-to-product assignments, per-brand exemption, or another capability authority. Account-aware billing, experience-aware session parameters, and experience-specific trial selection also need explicit design against the adjacent contracts. Product-data ownership and browser identity topology deserve their own decisions. [R1], [R4], [R10], [R16]

## Preserve behavior before merging customer records

Recommendation: begin with a parity inventory for each real product: domains and bookmarks; public/login/signup/onboarding journeys; routes and workflows; locale/defaults; users and Organizations; record ownership; integrations and OAuth callbacks; email/support identity; Plans, trials, currency, renewal and cancellation. The frameworks found here do not establish parity for either product. [R2], [R7], [R15], [R16]

A proposed sequence is:

1. Capture each existing journey and commercial lifecycle as the baseline.
2. Create the two experiences and move only demonstrably shared behavior into shared modules.
3. Preserve each product's URLs and defaults, then verify authentication, invitations, recovery links and communications end to end.
4. Map current customers to the appropriate Plans without silently removing abilities.
5. Reconcile identities, Organizations and overlapping subscriptions through an explicit mapping.
6. Introduce the combined offering only after its behavior and billing transitions are defined.

This is a planning recommendation. Do not merge Organizations merely because names, emails or email domains match. Existing dual subscribers are a concrete migration problem under the one-subscription rule; no brief validated a migration for them. Organization currency is also frozen by the current contract and must be included in the inventory. [R2], [R4], [R18]

## Council agreement, differences and coverage gaps

All three agree on domain-selected experience configuration; stable branding before login and with combined/exempt access; separate Organization, Entitlement and Grant authorities; explicit outbound context; and retaining ADR-0034 unless commercial/access requirements actually contradict it. The common external support concerns cookie scope, trusted host resolution and server authorization. [R1], [S1], [S2], [S4], [S9]

| Question | Briefs | Synthesis |
| --- | --- | --- |
| One SPA or two frontends? | Sol/Opus favor separate entries for materially different journeys; Grok emphasizes artifact/release separation. [S7] | Conditional recommendation; actual workflow inventory is missing |
| Product as access boundary? | Opus calls for revisiting ADR-0034; Sol allows separate resource ownership rules without replacing Billing. [R1], [S4], [S6] | Record the boundary; revise Billing ADR only where semantics change |
| Missing background brand? | Grok suggests a canonical fallback; Sol/Opus favor explicit validated context. [S3], [S6] | Define a communication policy; reject missing context when fallback would break a brand promise |
| Multi-host auth availability? | Opus leaves version support open; Sol checks pinned upstream 1.7.3 source. [S8] | Upstream support is evidenced, local wrapper still needs changes |
| Dynamic Stripe returns? | Grok suggests metadata/canonical return as an interim path; other briefs require explicit experience correlation. [R10], [R11] | A possible design, not an implemented compatible path |

No second research round was run to resolve these differences. Coordinator verification inspected local integration code and re-read sources already present in the briefs.

**Gaps none of the briefs establishes:** actual product behavior; existing identity/subscription reconciliation; desired sharing of records and deletion/export effects; central SSO implementation; brand-specific trial semantics; merchant configuration; cache/ingress deployment rules; end-to-end compatibility of the proposed composition. None produced a running prototype or verified migration.

The highest-impact product decisions remain:

1. Should the same User and Organization work in both products, and which data is shared?
2. Is brand separation presentation only, or does it impose resource/member restrictions?
3. Must users move between domains without signing in again?
4. Can the two products share billing identity, or must invoices, receipts and seller identity remain separate?
5. What happens to existing customers who already subscribe to both, including different currencies and trials?

These are outstanding choices, not an interview prerequisite to this research. The recommended experience/entitlement separation remains useful whichever answers are selected.

## Council models and method

Three independent read-only briefs were completed using the same topic and repository constraints:

| Catalog provider | Catalog model | Requested reasoning | Completion evidence |
| --- | --- | --- | --- |
| Codex (`codex`) | `gpt-6.1-sol` | high (`reasoningEffort`) | Completed; executed model confirmed |
| Cursor (`cursor`) | `grok-4.7` | high (`reasoning_effort`) | Completed on requested catalog model; executed-model field was not populated |
| Claude (`claudeAgent`) | `claude-opus-5-5` | high (`effort`) | Completed; executed model confirmed |

No family or version substitutions were made. Researchers returned cited briefs without writing files. The coordinator synthesized this document, checked the actual local seams, and retained uncertainty instead of treating model agreement as implementation proof.

## Merged sources

Repository references are the current authority for implementation and terminology. External links support platform behavior; recommendations are explicitly identified as synthesis/inference. Sources are restricted to those supplied in the research briefs; peripheral sources not used above are omitted.

### Repository

[R1]: ../docs/adr/0034-billing-owns-organization-entitlements.md
[R2]: ../GLOSSARY.md
[R3]: ../packages/backend/src/modules/billing/billing.service.ts:294
[R4]: ../packages/backend/src/modules/billing/billing.db.ts
[R5]: ../packages/commons/src/modules/billing/billing.entitlements.ts
[R6]: ../packages/backend/src/app.ts:145
[R7]: ../apps/starter/webapp/src/Providers.tsx
[R8]: ../packages/backend/src/modules/auth/auth.lib.ts:195
[R9]: ../packages/backend/src/app.ts:677
[R10]: ../docs/adr/0027-billing-checkout-portal-session-create-overlay.md
[R11]: ../packages/backend/src/modules/billing/billing.router.ts:78
[R12]: ../packages/frontend/src/modules/billing/hooks/useEntitlements.ts
[R13]: ../pnpm-workspace.yaml:104
[R14]: ../AGENTS.md
[R15]: ../docs/adr/0017-billing-org-paywall-seat-billing-opt-in.md
[R16]: ../docs/adr/0020-trial-price-at-start-card-catalog-switch.md
[R17]: ../packages/commons/src/modules/billing/billing.types.ts
[R18]: ../docs/adr/0019-billing-prices-per-currency-product.md

- [R1 — Billing owns Organization Entitlements][R1]
- [R2 — Domain glossary][R2]
- [R3 — Billing entitlement derivation][R3]
- [R4 — Subscription persistence and uniqueness][R4]
- [R5 — Capability/Bundle contracts][R5]
- [R6 — Backend app metadata][R6]
- [R7 — Starter provider composition][R7]
- [Starter route composition](../apps/starter/webapp/src/Router.tsx)
- [R8 — Better Auth integration][R8]
- [R9 — Default CORS configuration][R9]
- [R10 — Static billing session overlays][R10]
- [R11 — Billing success redirect][R11]
- [Session creation defaults](../packages/backend/src/modules/billing/billing.repository.ts:695)
- [R12 — Frontend entitlement state][R12]
- [R13 — Dependency versions][R13]
- [R14 — Architecture and job rules][R14]
- [R15 — Organization billing and Portal policy][R15]
- [R16 — Trial selection policy][R16]
- [R17 — Plan/trial configuration types][R17]
- [R18 — Organization currency policy][R18]

### Primary external sources

[S1]: https://www.better-auth.com/docs/reference/options
[S2]: https://expressjs.com/en/guide/behind-proxies.html
[S3]: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
[S4]: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
[S5]: https://openfeature.dev/specification/sections/evaluation-context/
[S6]: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
[S7]: https://vite.dev/guide/build.html
[S8]: https://github.com/better-auth/better-auth/blob/v1.7.3/packages/core/src/types/init-options.ts
[S9]: https://www.rfc-editor.org/rfc/rfc6265#section-4.1.2.3
[S10]: https://www.better-auth.com/docs/concepts/cookies
[S11]: https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1
[S12]: https://better-auth.com/docs/reference/security
[S13]: https://www.rfc-editor.org/rfc/rfc9111.html
[S14]: https://docs.stripe.com/customer-management/integrate-customer-portal
[S15]: https://github.com/stripe/stripe-node/blob/v20.1.0/types/Checkout/SessionsResource.d.ts
[S16]: https://docs.stripe.com/payments/checkout/customization/appearance
[S17]: https://docs.stripe.com/customer-management/configure-portal
[S18]: https://docs.stripe.com/get-started/account/branding
[S19]: https://docs.stripe.com/get-started/account/multiple-accounts
[S20]: https://docs.stripe.com/billing/multi-entity-business

- [S1 — Better Auth options and dynamic base URL][S1] — Sol, Opus
- [S2 — Express behind proxies][S2] — Grok, Opus
- [S3 — OWASP password-reset URL safety][S3] — Sol
- [S4 — OWASP authorization][S4] — Sol
- [S5 — OpenFeature evaluation context][S5] — Sol
- [S6 — OWASP multi-tenant security][S6] — Sol
- [S7 — Vite production/multi-page builds][S7] — Opus
- [S8 — Better Auth pinned source][S8] — Sol
- [S9 — Cookie domain scope, RFC 6265][S9] — all three
- [S10 — Better Auth cookies][S10] — all three
- [S11 — OAuth security, RFC 9700][S11] — Sol, Opus
- [S12 — Better Auth security][S12] — Sol, Grok
- [S13 — HTTP caching, RFC 9111][S13] — Sol, Opus
- [S14 — Stripe Portal integration][S14] — Sol
- [S15 — Stripe pinned SDK source][S15] — Sol
- [S16 — Stripe Checkout appearance][S16] — Sol, Grok
- [S17 — Stripe Portal configuration][S17] — Grok, Opus
- [S18 — Stripe account branding][S18] — Opus
- [S19 — Stripe multiple accounts][S19] — Sol
- [S20 — Stripe multi-entity billing][S20] — Opus

