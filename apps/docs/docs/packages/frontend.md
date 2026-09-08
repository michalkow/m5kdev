---
sidebar_position: 3
---

# Frontend package

`@m5kdev/frontend` contains shared React hooks, providers, utilities, and frontend
logic used by Vite React web apps and Expo React Native apps.

## Use it for

- App config and tRPC query providers.
- `ServerEventProvider` for Kernel SSE (invalidate queries when background work finishes). See [Server events](/modules/server-events).
- Auth, billing, file, notification inbox/preferences, table, AI Conversation, and operations hooks.
- Client-side utilities that do not belong in UI components.
- Platform-neutral table query state and query/filter serialization.

## Module docs

Start with these module pages:

- [File](/modules/file)
- [Auth](/modules/auth)
- [Billing](/modules/billing)
- [AI](/modules/ai)
- [Table](/modules/table)
- [Base](/modules/base)
- [App shell](/modules/app)
- [Server events](/modules/server-events)
- [Notification](/modules/notification)

List endpoints: [List query and Match query](/guides/list-query-and-match-query).

## Package rule

Keep data fetching and platform-neutral state in shared hooks when multiple apps
need the same behavior. Keep browser URL state, visual composition, and web-only
adapters in app code or `@m5kdev/web-ui`.

See [Frontend and Web UI split migration](/guides/frontend-web-ui-split) for
import changes after the `nuqs` split. Compose SSE:
[Kernel Server events in 0.35.0](/guides/v0.35.0-kernel-server-events-migration).
Inbox hooks: [Notification inbox in 0.36.0](/guides/v0.36.0-notification-inbox-migration).
Better Auth client lockstep: [Better Auth 1.7.2 in 0.37.0](/guides/v0.37.0-better-auth-1.7.2-migration).
