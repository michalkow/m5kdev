# organizationId names OrganizationActor on org-scoped Procedures

`organizationProcedure` / `requireAuth("organization")` add optional `organizationId` to caller-facing input (not user or admin). Resolve OrganizationActor: input `organizationId` if present (wins over session), else session active Organization, else an OrganizationActor already on the call, else 400. Input or session still require a live Membership. Then strip `organizationId` from handle input; handlers use `ctx.actor`. Cookieless callers (API key tRPC, MCP client) must pass `organizationId`. The MCP adapter advertises it required on org-scoped tools and checks the allowlist; API keys are not OAuth clients and skip the allowlist. Do not synthesize `session.activeOrganization*`.

## Considered Options

- **Session active Organization only** — rejected: MCP clients and API keys have no `setActive`.
- **Handlers read `input.organizationId` instead of Actor** — rejected: Grants, MemberId, and stamps stay on Actor.
- **Cookie session locks org** (input must match active Organization or be omitted) — rejected: input always wins when present.
