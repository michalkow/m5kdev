---
"@m5kdev/backend": patch
---

Enforce Organization Capability requirements declared in tRPC metadata before handlers run, while retaining existing service checks and optional Billing behavior.

Filter MCP tool discovery to Capabilities available in at least one allowlisted Organization with a live Membership, and enforce the target Organization's Entitlements on every invocation, including cached tools.
