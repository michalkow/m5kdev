---
status: superseded by ADR-0028
---

# MCP calls are a Core Module catalog, not a tRPC projection

Superseded by [ADR-0028](0028-mcp-tools-are-opted-in-trpc-procedures.md). Discovery-on-services was already superseded by [ADR-0016](0016-mcp-calls-are-module-hooks.md). The “not a tRPC projection” rule is reversed; Kernel-owned MCP HTTP stays rejected.

m5kdev apps expose a User’s MCP client to selected work as **MCP calls**. McpModule is Core (Starter registers it; `create-m5kdev` flag default off). 1.0 ships the builtin list-organizations MCP call plus whatever the app declares; other Core modules do not ship MCP calls.

## Considered Options

- **Selected tRPC procedures as MCP tools** (community trpc-mcp / meta on routers) — rejected: `organizationProcedure` reads session `activeOrganization*`, MCP has no `setActive`, and Procedure/Grant rules would hitch to a transport catalog.
- **Optional `@m5kdev/trpc-mcp` / `module-mcp`** — rejected: this is a stack capability like Workflow, not Clay/Pdf-class experimental.
- **Kernel owns MCP HTTP like tRPC** — rejected: apps omit McpModule to disable; extra HTTP stays on the module `express` hook ([ADR-0003](0003-kernel-owns-express-http-shell.md)).
