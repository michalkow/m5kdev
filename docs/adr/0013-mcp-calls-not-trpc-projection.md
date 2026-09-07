# MCP calls are a Core Module catalog, not a tRPC projection

Discovery-on-services is superseded by [ADR-0016](0016-mcp-calls-are-module-hooks.md). This ADR still stands: MCP calls are not selected tRPC procedures, not community `trpc-mcp` / `trpc-to-mcp`, and MCP HTTP is not Kernel-owned like tRPC.

m5kdev apps expose a User’s MCP client to selected work as **MCP calls**. McpModule is Core (Starter registers it; `create-m5kdev` flag default off). 1.0 ships the builtin list-organizations MCP call plus whatever the app declares; other Core modules do not ship MCP calls.

## Considered Options

- **Selected tRPC procedures as MCP tools** (community trpc-mcp / meta on routers) — rejected: `organizationProcedure` reads session `activeOrganization*`, MCP has no `setActive`, and Procedure/Grant rules would hitch to a transport catalog.
- **Optional `@m5kdev/trpc-mcp` / `module-mcp`** — rejected: this is a stack capability like Workflow, not Clay/Pdf-class experimental.
- **Kernel owns MCP HTTP like tRPC** — rejected: apps omit McpModule to disable; extra HTTP stays on the module `express` hook ([ADR-0003](0003-kernel-owns-express-http-shell.md)).
