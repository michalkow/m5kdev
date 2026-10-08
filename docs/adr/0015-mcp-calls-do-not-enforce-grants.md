---
status: superseded by ADR-0028
---

# MCP calls do not have to enforce Grants

Superseded by [ADR-0028](0028-mcp-tools-are-opted-in-trpc-procedures.md): an MCP call is a tRPC procedure, so Grant checks always run. Membership and MCP allowlist are still not Grants.

## Considered Options

- **Require `.access()` on every MCP call** — rejected: authors wanted optional Procedure delegation, not a second Grant DSL.
- **Every MCP handle must delegate to an existing Procedure** — rejected as mandatory; Starter Posts opts in for `list-posts` / `create-post`.
- **Treat MCP call as a Procedure in the glossary** — rejected: Procedure stays the Grant-checked noun; MCP call may wrap one.
