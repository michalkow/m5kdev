# McpModule does not enforce Grants on MCP calls

Membership and MCP allowlist are not Grants. McpModule injects Actor (and strips organizationId on app MCP calls); handle authors may call unguarded service or repository methods. Review and documentation are the control. This is unlike Procedure, which includes Grant check, and unlike Workflow jobs only in registration shape — jobs also skip Grants, which is the rhyme we accepted for execution.

## Considered Options

- **Require `.access()` on the MCP call builder** — rejected: authors wanted Actor in hand and ordinary service calls.
- **MCP handle must delegate to an existing Procedure** — rejected: same, plus they did not want a second mandatory wrap.
- **Treat MCP call as a Procedure in the glossary** — rejected: Procedure stays Grant-checked; the noun is MCP call.
