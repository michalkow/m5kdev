---
sidebar_position: 12
---

# Server events

Server events are Kernel infrastructure, not a Backend Module. Do not register
them with `createBackendApp`. They are a one-way HTTP Server-Sent Event (SSE)
bus so the UI can refresh after **background work the User did not wait on**
(typically a Workflow job). The acting User already receives tRPC mutation
results; those writes do not need an SSE.

The Kernel mounts `GET /events` when Auth is registered. Services emit through
Auth, not the Kernel bus. Expo has no provider in this release.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Subscribe path and Shared envelope (`serverEventEnvelopeSchema`). |
| `@m5kdev/backend` | Kernel SSE bus and `GET /events`. Auth emit APIs that validate the envelope. |
| `@m5kdev/frontend` | `ServerEventProvider`, `useServerEventHandler`, credentialed `EventSource`. |

`@m5kdev/web-ui` has no Server event components.

## Shared contract

Import from `@m5kdev/commons/modules/base/server-event.schema`:

- `SERVER_EVENT_SUBSCRIBE_PATH` — `"/events"`
- `serverEventEnvelopeSchema` / `ServerEventEnvelope`

Envelope fields:

| Field | Meaning |
| --- | --- |
| `resource` | App-defined string (for example `"workflow"`). Handlers key on this. |
| `id` | Resource id (or a stable job name when that is the signal). |
| `change` | `"created"` \| `"updated"` \| `"deleted"` |
| `organizationId` | Tag for the client, **not** the bus audience. `null` always delivers. A set id delivers only when it matches `session.activeOrganizationId`. |
| `snapshot` | Optional opaque payload. The bus does not enforce Grants on it. |

Kernel `emit` / `batchEmit` publish untyped JSON to UserIds. Auth
safe-parses the Shared envelope before forwarding. The client safe-parses and
ignores garbage. There is no replay: a reconnect must invalidate.

## Backend

### Subscribe route

When Auth middleware exists, the Kernel mounts:

```http
GET /events
```

Cookie session, Auth middleware, `401` if unauthenticated. After Kernel
`close()`, attach returns `503`. Signal shutdown ends SSE streams first, then
HTTP. CORS already sends `credentials: true`. The response sets
`text/event-stream`, `Cache-Control: no-cache, no-transform`, and
`X-Accel-Buffering: no`, plus a 15s comment keepalive.

Do not mount a competing `GET /events` on a module `express` hook: Express
registers module routes first, so that handler would win.

Apps that omit Auth never get the route.

### Emit through Auth

Call `AuthService` from the service that owns the work:

| Method | Audience |
| --- | --- |
| `userEmit` | One UserId |
| `batchUserEmit` | Distinct UserIds (empty list is a no-op) |
| `organizationEmit` | Active Members of that Organization (nobody if listing fails or the org is empty) |
| `emitServerEvent` | `organizationId === null` → `userEmit`; otherwise `organizationEmit` (acting `userId` is unused for audience) |

All four are void and fire-and-forget. Call Auth directly. Do not wrap
`userEmit` in a private helper that only forwards.

```ts
this.service.auth.userEmit({
  userId: payload.userId,
  resource: "workflow",
  id: jobName,
  change: "updated",
  organizationId: null,
});
```

`organizationEmit` (or `emitServerEvent` with an Organization id) notifies
**other Members**. Use it when a job (or similar off-request work) creates or
changes an org-scoped entity those Members must see. Skip it for tRPC writes
that already return the entity.

### Redis

If Redis exists, the bus uses pub/sub (`m5kdev:server-event:<userId>`). Without
Redis it is in-process only. Worker processes and multiple HTTP instances that
emit must share Redis (same split-brain rule as Workflow). Missed events are
not replayed; recover with `onReconnect` invalidation.

## Frontend

Compose `ServerEventProvider` inside `AuthProvider` and
`AppTrpcQueryProvider` (it needs the session and the query client). The Starter
wraps it in `StarterServerEventProvider` so Workflow handlers can be
feature-gated.

```tsx
import { ServerEventProvider } from "@m5kdev/frontend/modules/app/components/ServerEventProvider";

<AuthProvider>
  <AppTrpcQueryProvider>
    <ServerEventProvider
      handlers={{
        workflow: (_event, queryClient) => {
          void queryClient.invalidateQueries(trpc.workflow.list.queryFilter());
        },
      }}
      onReconnect={(queryClient) => {
        void queryClient.invalidateQueries(trpc.workflow.list.queryFilter());
      }}
    >
      {children}
    </ServerEventProvider>
  </AppTrpcQueryProvider>
</AuthProvider>
```

- `handlers` — composition-root map of `resource` → handler.
- `useServerEventHandler` — register while a route is mounted.
- `onReconnect` — invalidate the same queries; the stream has no replay.
- Keep polling only as a fallback for in-progress status (queued → running) if
  you emit only when the job finishes.

The browser `EventSource` is opened with `withCredentials: true` against
`serverUrl + "/events"`. Expo does not ship this provider.

## App-level flow

1. A tRPC mutation queues a job and returns `jobId`.
2. The job `.handle` finishes the work the User did not wait on.
3. The job service calls `this.service.auth.userEmit` (or `organizationEmit`).
4. The webapp handler invalidates the matching `queryFilter()`.

Starter reference: `DemoWorkflowService` `demo.ping` emits resource
`"workflow"`; `StarterServerEventProvider` invalidates `trpc.workflow.list`.

## Operational notes

- No new environment variables. Cookie auth uses the existing session.
- Reverse proxies must not buffer `GET /events` (the Kernel already sends
  `X-Accel-Buffering: no`).
- Multi-instance HTTP or a separate worker that emits needs Redis.
- Do not emit from mutations that already return the entity.

## Related docs

- [Auth](/modules/auth) — emit APIs live on `AuthService`
- [Workflow](/modules/workflow) — typical emit site
- [App shell](/modules/app) — provider order
- [Kernel Server events in 0.35.0](/guides/v0.35.0-kernel-server-events-migration)
- [Notification](/modules/notification) — `send` `userEmit`s `resource: "notification"`
- [Kernel Express HTTP shell](/guides/v0.33.0-kernel-express-http-shell-migration)
