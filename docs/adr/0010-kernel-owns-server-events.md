# Kernel owns Server events

Live UI in this stack is React Query polling; 1.0 still needs a Kernel-owned one-way bus so Services can emit that a resource was created, updated, or deleted and clients can refetch or patch cache. Server events are Kernel infrastructure and Kernel HTTP shell (subscribe over SSE, cookie-authenticated User, one stream), not a Backend Module and not a module `express` hook — same class of “every app would copy this” as baked SPA ([ADR-0003](0003-kernel-owns-express-http-shell.md), [ADR-0006](0006-kernel-owns-baked-spa.md)). The bus is addressed to UserIds the emitter supplies (Auth `listMemberUserIds` for org-wide cases); `organizationId` on the event is a tag for the client, not the audience. Snapshots are opaque and optional; the bus does not enforce Grants. Redis pub/sub if Redis exists, else in-process; no replay — reconnect invalidates. Notification inbox may consume this; it is not the bus.

## Considered Options

- **Core Module or Optional Backend Module** — rejected: omitting the bus is not a product choice; registration would recreate the stale-convention problem ADR-0003 removed.
- **Backend Module `express` hook** — rejected for this route: extra *product* HTTP stays on modules; this subscribe endpoint is shell.
- **WebSockets or tRPC subscriptions** — rejected: the event is one-way “a resource changed,” not a duplex channel. Conversation streaming stays on AI HTTP.
- **Organization-addressed fan-out** — rejected: Membership is not a Grant check, and org snapshots would land on every Member’s stream. Emitter passes `userIds`; org-wide File/Post emits collect recipients via Auth.
- **Redis Streams + Last-Event-ID replay** — rejected: durability would make Redis required for a correct bus. Missed events are recovered by a one-shot invalidate on reconnect. Worker and multi-instance emits still need Redis (in-process otherwise is split-brain, same as Workflow).

## Consequences

- ADR-0003’s “other extra HTTP on a module hook” has a second Kernel exception, beside SPA.
- Org-wide emit is an Auth/Membership listing plus Server event emit, not a bus primitive.
- A sloppy org-wide snapshot can bypass `read:own`; that is the emitter’s problem.
- Web client is `ServerEventProvider` in `@m5kdev/frontend` (handlers optional, filter by active Organization). Expo is out of 1.0 freeze.
