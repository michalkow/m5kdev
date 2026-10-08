---
status: superseded by ADR-0028
---

# MCP calls are module hooks, not Service scrape and not a tRPC projection

Superseded by [ADR-0028](0028-mcp-tools-are-opted-in-trpc-procedures.md). Service-property scrape stays rejected; `mcp()` / `mcpUser()` hooks and “not wrapping tRPC” do not. HTTP on McpModule, flat names, omit-module-to-disable, and “do not synthesize `session.activeOrganization*`” still hold.

## Considered Options

- **Keep scraping Service properties** (DEV-391) — rejected: authors want `posts.mcp.ts` merged like `posts.trpc.ts`.
- **Always merge like tRPC even without McpModule** — rejected: omit McpModule must disable MCP.
- **Namespace tools as `posts.list`** — rejected: MCP tools are a flat list.
- **Require every handle to be a Procedure** — rejected: Grants stay optional; Starter Posts opts in.
- **Synthesize `session.activeOrganizationId`** — rejected: that is webapp `setActive`; MCP organizationId is the Actor.
- **UserActor calls must pass allowlist** — rejected: allowlist is the org-scoped consent boundary; token already proves User.
