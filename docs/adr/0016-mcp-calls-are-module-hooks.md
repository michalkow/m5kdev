# MCP calls are module hooks, not Service scrape and not a tRPC projection

Kernel merges Backend Module `mcp()` (OrganizationActor) and `mcpUser()` (UserActor) catalogs at boot only when McpModule is registered — the same composition shape as tRPC fragments, not Workflow-job scraping of service properties, and not wrapping a tRPC router. Names are flat (map key = tool name); collisions fail; `list-organizations` is reserved. HTTP still lives on McpModule ([ADR-0003](0003-kernel-owns-express-http-shell.md)). Grants are optional: a handle may delegate to a Procedure or call unguarded service methods. Starter Posts `list-posts` / `create-post` delegate to Procedures; Posts.create attributes from `ctx.actor`, not `session.activeOrganizationId`. User-scoped calls skip the MCP allowlist; list-organizations reads it as data. `create-m5kdev` `mcp` stays default off (omit McpModule → no merge); Starter keeps `posts.mcp.ts` and strips it when the flag is off.

Supersedes service-property discovery in [ADR-0013](0013-mcp-calls-not-trpc-projection.md) and the “never Grants” rule in [ADR-0015](0015-mcp-calls-do-not-enforce-grants.md). Not wrapping tRPC still stands.

## Considered Options

- **Keep scraping Service properties** (DEV-391) — rejected: authors want `posts.mcp.ts` merged like `posts.trpc.ts`.
- **Always merge like tRPC even without McpModule** — rejected: omit McpModule must disable MCP.
- **Namespace tools as `posts.list`** — rejected: MCP tools are a flat list.
- **Require every handle to be a Procedure** — rejected: Grants stay optional; Starter Posts opts in.
- **Synthesize `session.activeOrganizationId`** — rejected: that is webapp `setActive`; MCP organizationId is the Actor.
- **UserActor calls must pass allowlist** — rejected: allowlist is the org-scoped consent boundary; token already proves User.
