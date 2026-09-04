# MCP OrganizationActor comes from organizationId plus per-client allowlist

An MCP client authenticates as a User via Better Auth MCP OAuth (1.7+ `@better-auth/mcp`, jwt, resource-bound tokens — not API keys and not the webapp cookie session). Consent records an **MCP allowlist** per OAuth client and User; changing it requires re-consent. App-declared MCP calls require organizationId from the client; McpModule checks the allowlist, resolves a live Membership, builds OrganizationActor, and strips organizationId from handle input. Builtin list-organizations is UserActor and does not take organizationId. The OAuth token is not bound to one Organization.

## Considered Options

- **Token IS the Membership** (consent/resource bound to one Organization) — rejected: product wants the User to name the org per call, with an allowlist as the consent boundary.
- **Better Auth API keys as MCP credentials** — rejected: MCP clients expect OAuth; keys are User-keyed and are not an OrganizationActor ([ADR-0012](0012-auth-trpc-owns-membership.md) leaves keys on Better Auth HTTP for other uses).
- **OAuth scopes as the allowlist** (no app table) — rejected: allowlist is our table, token only proves User; still per OAuth client, not User-global.
- **organizationId only in a header / per-org MCP URL** — rejected: the agent passes organizationId on each app MCP call.
