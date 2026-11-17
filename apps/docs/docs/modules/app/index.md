---
sidebar_position: 5
---

# App shell

App shell is a Shared-contract / UI surface, not a Backend Module. It is the
frontend composition root: app-wide configuration, the typed tRPC client +
TanStack Query provider, role helpers, and the reusable shell/sidebar UI.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/frontend` | `AppConfigProvider`, `loadExperience`, `AppTrpcQueryProvider`, `ServerEventProvider`, `useAppConfig`, `useAppTrpc`, `useAppRoles`, `useRoleLabel`, locale utilities. |
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

## Experiences

An Experience is a product's public presentation under a configured domain:
product identity, Brand Profile, and canonical web/API origins. It is independent
of the visiting User, Organization, Entitlements, and Grants.

Existing apps keep the single-Experience shorthand above. Backend
`createBackendApp({ app: { name, urls, brand } })` synthesizes a non-strict
registry from those fields and environment defaults, and serves
`GET /app/experience`. Email, Auth, Billing, Connection, Notification, and
Workflow keep their current behavior until you opt into an explicit registry.

To resolve by domain, pass `app.experiences` instead of `name` / `urls` / `brand`.
Do not mix the two authoring styles, even with empty values:

```ts
createBackendApp({
  app: {
    experiences: {
      defaultExperience: "radar",
      brands: { radar: { name: "Radar" }, partner: { name: "Partner Radar" } },
      definitions: {
        radar: {
          product: "radar",
          brand: "radar",
          webOrigin: "https://radar.example",
          apiOrigin: "https://radar.example",
        },
        partner: {
          product: "radar",
          brand: "partner",
          webOrigin: "https://partner.example",
          apiOrigin: "https://partner.example",
        },
      },
    },
    locales,
    roles,
  },
});
```

Load the selected public descriptor before Auth and query providers. Pass that
descriptor to `AppConfigProvider`; do not also pass `appName` / `appUrl` /
`serverUrl`:

```tsx
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";

const experience = await loadExperience({
  url: `${serverUrl.replace(/\/$/, "")}/app/experience`,
});

<AppConfigProvider config={{ experience, locales, roles }}>
  {children}
</AppConfigProvider>
```

`loadExperience` defaults to `/app/experience`. The Kernel returns only the
public descriptor with `Cache-Control: private, no-store`. Starter Webapp and
Expo wrap this in `ExperienceBootstrap`, which retries on failure and keeps Auth
unmounted until the descriptor is ready. A separately hosted frontend may supply
a matching validated descriptor instead of fetching.

`useAppConfig()` still exposes `appName`, `appUrl`, and `serverUrl` from the
selected Experience. Module-specific contracts:

- [Auth](/modules/auth#experience-bound-invitations-and-account-links)
- [Email](/modules/email#immediate-sends-for-an-experience)
- [Billing](/modules/billing)
- [Connection](/modules/connect)
- [Notification](/modules/notification)
- [Workflow](/modules/workflow#experience-references-in-delayed-communication)

## tRPC client

`AppTrpcQueryProvider` wires the typed tRPC client (parameterized by your app's
exported `AppRouter` type) together with the TanStack Query client.
`useAppTrpc()` returns the typed client inside components.

## Provider order

Follow the app shell pattern from AGENTS.md: `NuqsAdapter` + `BrowserRouter` +
`Providers.tsx`, where `Providers.tsx` composes `AppConfigProvider`,
`AppTrpcQueryProvider`, `AuthProvider`, and any other global providers. Do not
mount feature-level global providers ad hoc.

`ServerEventProvider` belongs inside `AuthProvider` + `AppTrpcQueryProvider`
(it needs the session and the query client). Register handlers that invalidate
queries when a Workflow job (or other background work) finishes. The acting User
already receives tRPC mutation results; those writes do not need an SSE. See
[Server events](/modules/server-events).

## Shell UI

`@m5kdev/web-ui` ships the application chrome:

- `AppShell` — layout frame for authenticated routes. It does not import
  Notification; the app mounts `NotificationSidebarInbox` in sidebar `content`.
  See [Notification](/modules/notification).
- `AppLoader` — full-screen loading state while session/config resolve.
- `AppSidebar` with `AppSidebarHeader`, `AppSidebarContent`,
  `AppSidebarInvites` (pending organization invitations), and `AppSidebarUser`
  (user menu).
