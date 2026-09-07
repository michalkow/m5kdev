# MCP calls do not have to enforce Grants

Superseded in part by [ADR-0016](0016-mcp-calls-are-module-hooks.md): Grants are **not required** on an MCP call. A handle may delegate to a Procedure (Grant check runs) or call unguarded service methods. Membership and MCP allowlist are still not Grants; they only build OrganizationActor for organization-scoped calls. An MCP call is still not a Procedure in the glossary.

## Considered Options

- **Require `.access()` on every MCP call** — rejected: authors wanted optional Procedure delegation, not a second Grant DSL.
- **Every MCP handle must delegate to an existing Procedure** — rejected as mandatory; Starter Posts opts in for `list-posts` / `create-post`.
- **Treat MCP call as a Procedure in the glossary** — rejected: Procedure stays the Grant-checked noun; MCP call may wrap one.
