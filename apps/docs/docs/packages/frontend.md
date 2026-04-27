---
sidebar_position: 3
---

# Frontend package

`@m5kdev/frontend` contains shared React hooks, providers, utilities, and frontend
logic used by app web clients.

## Use it for

- App config and tRPC query providers.
- Auth, billing, file, table, and operations hooks.
- Client-side utilities that do not belong in UI components.

## Module docs

Start with these module pages:

- [File](/modules/file)
- [Auth](/modules/auth)
- [Billing](/modules/billing)
- [Table](/modules/table)
- [App shell](/modules/app)

## Package rule

Keep data fetching and URL state in shared hooks when multiple apps need the same
behavior. Keep visual composition in app code or `@m5kdev/web-ui`.
