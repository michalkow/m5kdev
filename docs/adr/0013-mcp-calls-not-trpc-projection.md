# MCP calls are a Core Module registry, not a tRPC projection

m5kdev apps expose a User’s MCP client to selected Service work as **MCP calls**, declared on services (`mcp.description().input().handle()`) and discovered at boot the way Workflow jobs are — not by wrapping tRPC procedures or adopting community `trpc-mcp` / `trpc-to-mcp`. McpModule is Core (Starter registers it; `create-m5kdev` flag default off). 1.0 ships only the builtin list-organizations MCP call plus whatever the app declares; other Core modules do not ship MCP calls.

## Considered Options

- **Selected tRPC procedures as MCP tools** (community trpc-mcp / meta on routers) — rejected: `organizationProcedure` reads session `activeOrganization*`, MCP has no `setActive`, and Procedure/Grant rules would hitch to a transport catalog.
- **Optional `@m5kdev/trpc-mcp` / `module-mcp`** — rejected: this is a stack capability like Workflow, not Clay/Pdf-class experimental.
- **Kernel owns MCP HTTP like tRPC** — rejected: apps omit McpModule to disable; extra HTTP stays on the module `express` hook ([ADR-0003](0003-kernel-owns-express-http-shell.md)).
