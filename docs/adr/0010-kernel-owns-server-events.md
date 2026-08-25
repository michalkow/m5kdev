# Kernel owns Server events

Live UI in this stack is React Query polling; 1.0 still needs a Kernel-owned one-way bus so Services can emit that a resource was created, updated, or deleted and clients can refetch or patch cache. Server events are Kernel infrastructure and Kernel HTTP shell (subscribe over SSE, cookie-authenticated User, one stream), not a Backend Module and not a module `express` hook — same class of “every app would copy this” as baked SPA ([ADR-0003](0003-kernel-owns-express-http-shell.md), [ADR-0006](0006-kernel-owns-baked-spa.md)). The bus is addressed to UserIds. Kernel emit and batchEmit publish untyped JSON and do not validate the Shared envelope. Services emit Server events through Auth (`userEmit`, `batchUserEmit`, `organizationEmit`, `emitServerEvent`); `organizationId` on the event is a tag for the client, not the audience. Snapshots are opaque and optional; the bus does not enforce Grants. Redis pub/sub if Redis exists, else in-process; no replay — reconnect invalidates. Notification inbox may consume this; it is not the bus.

## Considered Options

- **Core Module or Optional Backend Module** — rejected: omitting the bus is not a product choice; registration would recreate the stale-convention problem ADR-0003 removed.
- **Backend Module `express` hook** — rejected for this route: extra *product* HTTP stays on modules; this subscribe endpoint is shell.
- **WebSockets or tRPC subscriptions** — rejected: the event is one-way “a resource changed,” not a duplex channel. Conversation streaming stays on AI HTTP.
- **Organization-addressed fan-out on the Kernel bus** — rejected: Membership is not a Grant check, and org snapshots would land on every Member’s stream. Auth.organizationEmit / emitServerEvent list active Members and then batchEmit; the bus stays User-addressed.
- **Emitter lists Members then calls Kernel emit** — rejected: every Service would re-learn Membership. Auth owns that listing behind organizationEmit / emitServerEvent.
- **Emit from every tRPC mutation that writes** — rejected: the acting User already receives the entity on the mutation result. Org-wide notify is for changes other Members must see without having made the request, not for routine edits.
- **Kernel validates the Shared envelope** — rejected: the bus is JSON to UserIds; Auth and the client share the envelope contract.
- **Redis Streams + Last-Event-ID replay** — rejected: durability would make Redis required for a correct bus. Missed events are recovered by a one-shot invalidate on reconnect. Worker and multi-instance emits still need Redis (in-process otherwise is split-brain, same as Workflow).

## Consequences

- ADR-0003’s “other extra HTTP on a module hook” has a second Kernel exception, beside SPA.
- Org-wide emit is Auth resolving Memberships plus Kernel batchEmit, not a bus audience.
- Kernel emit/batchEmit do not Zod-parse the envelope; the client safe-parses and ignores garbage.
- A sloppy org-wide snapshot can bypass `read:own`; that is the emitter’s problem.
- Emit from Workflow job handlers (and similar background work) so the UI can refresh a change that did not return on the triggering request. Starter demo: `DemoWorkflowService` `demo.ping`.
- Kernel shutdown ends Server event streams (and rejects later subscribe with 503) before closing HTTP.
- Web client is `ServerEventProvider` in `@m5kdev/frontend` (handlers optional, filter by active Organization). Expo is out of 1.0 freeze.
