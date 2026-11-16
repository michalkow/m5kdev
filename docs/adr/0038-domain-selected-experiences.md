# Domains select Experiences; Organizations retain access authority

One backend may present several app-owned Experiences. An Experience combines a product key, a reusable Brand Profile, canonical web/API origins and an email profile; domains select it before authentication. Kernel app infrastructure owns registry normalization and request resolution, while apps own shells and workflows. Presentation never changes OrganizationActor, Billing Entitlements, Grants, or the canonical MCP issuer/resource (ADR-0034 and ADR-0029).

## Considered Options

- **Flat per-domain copies** — rejected: repeating sender, identity and URL configuration makes aliases and alternate brands drift across integrations.
- **An arbitrary callback in every integration** — rejected: Auth, Email and Billing would each need to agree on inputs, trust and fallback behavior.
- **One registry with referenced profiles** — selected: validate once at boot, expose a minimal public descriptor, and resolve explicit Experience references in services and workers. Two Experiences may share a product key and have different Brand Profiles.

## Consequences

- Existing name/URL/brand configuration remains supported as a single-Experience shorthand, normalized at the boundary. Explicit registry configuration cannot mix competing identity fields. Its default is only for deliberately context-free operations (for example MCP login), not an unknown browser host.
- Exact configured web authorities select an Experience. A shared API authority uses a registered browser Origin pair; ordinary cookieless calls can remain presentation-neutral. Forwarded headers require explicit trusted-proxy configuration. Canonical links come from configuration.
- Request context and queued references are explicit and immutable. No singleton current brand, new tenancy axis or Experience tables. Missing multi-experience context is an error for presentation-sensitive work; scheduled/webhook work uses an app-registered policy.
- Public bootstrap supports a runtime-selecting SPA and separately hosted frontends. It excludes email/Stripe secrets and the full registry. Kernel still serves one baked SPA root (ADR-0006).
- Flow state binds Experience and destination to existing auth/provider tokens; changing a callback URL cannot relabel an already-bound flow. Domain-local sessions do not promise cross-domain SSO.
- Billing contextual parameter overlays apply after defaults and the existing static overlay with the same merge semantics; ADR-0027 records that extension when implemented. Entitlement derivation, one Subscription per Organization/environment, one Trial Plan per currency and account-level Stripe branding limits remain unchanged.

## Prototype evidence

Issue #89 compares referenced registry, flat records and app callback configurations through two products, another brand of the first product, a combined Plan and an unknown host. The throwaway single-file logic demo is archived on `prototype/88-experience-api`; production keeps only this decision. The first implementation checkpoint is a public bootstrap round trip; auth, communication and billing flows migrate next, and #100 deletes remaining competing internal runtime readers.
