# MCP tools are opted-in tRPC procedures

MCP HTTP stays on thin McpModule (omit the module to disable MCP OAuth and HTTP; [ADR-0003](0003-kernel-owns-express-http-shell.md)). The catalog is tRPC procedures with `meta.mcp` `{ name, description }` — instruction-style copy, not OpenAPI. `*.mcp.ts` / `mcp()` hooks and unguarded handles are gone; Grant checks always run. `list-organizations` is a user-scoped tRPC procedure on McpModule. 1.0 surface is unchanged: that tool plus Starter `list-posts` / `create-post`. Admin procedures may be marked; they use AdminActor and skip the allowlist.

Supersedes [ADR-0013](0013-mcp-calls-not-trpc-projection.md), [ADR-0015](0015-mcp-calls-do-not-enforce-grants.md), and [ADR-0016](0016-mcp-calls-are-module-hooks.md). [ADR-0014](0014-mcp-actor-from-orgid-and-allowlist.md) still stands for MCP OAuth and the allowlist.

## Considered Options

- **Keep `mcp()` module-hook catalog** — rejected: dual files and schemas; `organizationId` on org-scoped tRPC input removes the old session-`setActive` blocker ([ADR-0029](0029-organizationid-names-organization-actor.md)).
- **Community trpc-mcp / OpenAPI meta for MCP descriptions** — rejected: MCP copy is agent instruction, not user-facing OpenAPI; the adapter lives in McpModule, not an Optional package.
- **Kernel owns MCP HTTP like tRPC** — still rejected ([ADR-0003](0003-kernel-owns-express-http-shell.md)).
