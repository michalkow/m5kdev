# Support reuses Workflow and requires its Redis runtime

The planned Support Core Module requires Auth, File, Tag and Workflow; Workflow requires Redis. Durable automation, timed snooze and cleanup reuse the existing worker runtime so Support does not introduce another scheduler or promise an equivalent no-Redis execution path. Apps may omit Support; human support remains independent of AI answering and translation, but still requires the agreed runtime.

## Considered Options

- **A reduced no-Redis Support variant** — deferred: it adds another supported behavior matrix and does not provide the same durable timers and processing.
- **A new PostgreSQL-backed scheduler inside Support** — rejected for this scope: duplicating worker infrastructure expands a product module into a second runtime.
- **In-request automation only** — rejected for the complete feature set: request lifetime is not the agreed durable processing boundary.

## Consequences

- Required infrastructure is validated at composition/startup; feature-specific provider/dependency/usage requirements are checked before enabling automation.
- AI answering and translation have separate enable switches and neither is required for human messaging.
- Redis fanout remains notification infrastructure; PostgreSQL and HTTP synchronization own Support history and recovery under [ADR-0010](0010-kernel-owns-server-events.md).
