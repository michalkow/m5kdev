---
sidebar_position: 5
---

# App shell module

The app shell module is the frontend composition root: app-wide configuration,
the typed tRPC client + TanStack Query provider, role helpers, and the reusable
shell/sidebar UI.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/frontend` | `AppConfigProvider`, `AppTrpcQueryProvider`, `useAppConfig`, `useAppTrpc`, `useAppRoles`, `useRoleLabel`, locale utilities. |
| `@m5kdev/web-ui` | `AppShell`, `AppLoader`, `AppSidebar` (+ header, content, invites, user sections). |

## App configuration

`AppConfigProvider` carries the values every module UI needs:

```tsx
<AppConfigProvider
  config={{
    appUrl: import.meta.env.VITE_APP_URL,
    serverUrl: import.meta.env.VITE_SERVER_URL,
    appName: "My App",
    locales,   // optional AuthLocaleConfig
    roles,     // optional AuthRolesConfig — must match backend roles
  }}
>
  {children}
</AppConfigProvider>
```

Read it anywhere with `useAppConfig()`. `useAppRoles()` and `useRoleLabel()`
resolve the role config (shared with the backend via
`createBackendApp({ app: { roles } })`) into assignable role lists and localized
labels.

## tRPC client

`AppTrpcQueryProvider` wires the typed tRPC client (parameterized by your app's
exported `AppRouter` type) together with the TanStack Query client.
`useAppTrpc()` returns the typed client inside components.

## Provider order

Follow the app shell pattern from AGENTS.md: `NuqsAdapter` + `BrowserRouter` +
`Providers.tsx`, where `Providers.tsx` composes `AppConfigProvider`,
`AppTrpcQueryProvider`, `AuthProvider`, and any other global providers. Do not
mount feature-level global providers ad hoc.

## Shell UI

`@m5kdev/web-ui` ships the application chrome:

- `AppShell` — layout frame for authenticated routes.
- `AppLoader` — full-screen loading state while session/config resolve.
- `AppSidebar` with `AppSidebarHeader`, `AppSidebarContent`,
  `AppSidebarInvites` (pending organization invitations), and `AppSidebarUser`
  (user menu).
