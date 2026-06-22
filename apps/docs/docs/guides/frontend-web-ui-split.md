---
sidebar_position: 3
---

# Frontend and Web UI split migration

`@m5kdev/frontend` is now the platform-neutral React package. Everything
exported from it must be importable from both a Vite React web app and an Expo
React Native app.

`@m5kdev/web-ui` owns web-only UI behavior and browser URL state, including the
HeroUI/Tailwind components, React Router route components, and `nuqs` table
adapters.

## Ownership after the split

| Package | Use for |
| --- | --- |
| `@m5kdev/frontend` | App config, tRPC providers, auth client setup, session hooks, billing state, upload hooks, neutral table query state, and query/filter serializers. |
| `@m5kdev/web-ui` | HeroUI/Tailwind components, app shell UI, auth/admin route UI, billing route UI, table UI, and `nuqs` URL query-state adapters. |

The rule is: app state and service hooks live in `@m5kdev/frontend`; web
presentation and browser adapters live in `@m5kdev/web-ui`.

Do not add `.native` files to `@m5kdev/frontend`. When a runtime value differs
between Vite and Expo, make the frontend API accept that value as a parameter
and let each app pass it in from its own environment.

## Required import changes

Move web-only imports out of `@m5kdev/frontend`.

| Old import | New import |
| --- | --- |
| `@m5kdev/frontend/modules/app/components/AppLoader` | `@m5kdev/web-ui/modules/app/components/AppLoader` |
| `@m5kdev/frontend/modules/app/components/AppShell` | `@m5kdev/web-ui/modules/app/components/AppShell` |
| `@m5kdev/frontend/modules/app/components/AppSidebar*` | `@m5kdev/web-ui/modules/app/components/AppSidebar*` |
| `@m5kdev/frontend/modules/auth/components/AuthPublic*` | `@m5kdev/web-ui/modules/auth/components/AuthPublic*` |
| `@m5kdev/frontend/modules/auth/components/AuthAdmin*` | `@m5kdev/web-ui/modules/auth/components/AuthAdmin*` |
| `@m5kdev/frontend/modules/auth/components/AuthOrganization*` | `@m5kdev/web-ui/modules/auth/components/AuthOrganization*` |
| `@m5kdev/frontend/modules/auth/components/AuthUser*` | `@m5kdev/web-ui/modules/auth/components/AuthUser*` |
| `@m5kdev/frontend/modules/billing/components/BillingPlanSelect` | `@m5kdev/web-ui/modules/billing/components/BillingPlanSelect` |
| `@m5kdev/frontend/modules/billing/components/BillingRouter` | `@m5kdev/web-ui/modules/billing/components/BillingRouter` |
| `@m5kdev/frontend/modules/table/components/*` | `@m5kdev/web-ui/modules/table/components/*` |
| `@m5kdev/frontend/modules/table/hooks/useNuqsTable` | `@m5kdev/web-ui/modules/table/hooks/useNuqsTable` |
| `@m5kdev/frontend/modules/table/hooks/useNuqsQueryParams` | `@m5kdev/web-ui/modules/table/hooks/useNuqsQueryParams` |
| `@m5kdev/frontend/modules/table/hooks/useDateRangeFilter` | `@m5kdev/web-ui/modules/table/hooks/useDateRangeFilter` |
| `ListUsersNuqsInput` from `@m5kdev/frontend/modules/auth/hooks/useAuthAdmin` | `ListUsersQueryInput` from the same module |

Keep these imports in `@m5kdev/frontend`:

```tsx
import {
  AppConfigProvider,
  AppTrpcQueryProvider,
  AuthProvider,
  authClient,
  configureAuthClient,
  createM5KAuthClient,
  useAppConfig,
  useAppTRPC,
  useAuthClient,
  useFileUpload,
  useS3Upload,
  useSession,
  useSubscription,
  useTableQueryParams,
  useQueryWithParams,
} from "@m5kdev/frontend";
```

Deep imports are still available through package exports when a smaller import
surface is preferred:

```ts
import { useFileUpload } from "@m5kdev/frontend/modules/file/hooks/useUpload";
import { useQueryWithParams } from "@m5kdev/frontend/modules/table/hooks/useQueryWithParams";
import { useTableQueryParams } from "@m5kdev/frontend/modules/table/hooks/useTableQueryParams";
import {
  decodeFilterTuples,
  encodeFilterToTuple,
  parseFiltersParam,
  serializeFiltersParam,
  type QueryParamsState,
} from "@m5kdev/frontend/modules/table/queryParams";
```

## Web table usage

Web apps that want table state in the URL should import the `nuqs` adapter from
`@m5kdev/web-ui`. The Vite app shell must keep `NuqsAdapter` around the route
tree.

```tsx
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";

export function App() {
  return (
    <NuqsAdapter>
      <Router />
    </NuqsAdapter>
  );
}
```

```tsx
import useNuqsTable, {
  type TableParams,
} from "@m5kdev/web-ui/modules/table/hooks/useNuqsTable";

const { params, query } = useNuqsTable({
  getQueryOptions: postsQueryOptions,
  queryParams: { organizationId },
  prefix: "posts",
});
```

Web UI table components continue to come from `@m5kdev/web-ui`:

```tsx
import { NuqsTable } from "@m5kdev/web-ui/modules/table/components/NuqsTable";
import { TableFiltering } from "@m5kdev/web-ui/modules/table/components/TableFiltering";
import { TablePagination } from "@m5kdev/web-ui/modules/table/components/TablePagination";
```

## Expo or platform-neutral table usage

Expo apps must not import `@m5kdev/web-ui`, `nuqs`, `react-router`, or
`@heroui/react`. Use the in-memory neutral state hook from `@m5kdev/frontend`,
then pass that state to `useQueryWithParams`.

```tsx
import { useQueryWithParams } from "@m5kdev/frontend/modules/table/hooks/useQueryWithParams";
import { useTableQueryParams } from "@m5kdev/frontend/modules/table/hooks/useTableQueryParams";

const queryState = useTableQueryParams();
const query = useQueryWithParams({
  getQueryOptions: postsQueryOptions,
  queryParams: { organizationId },
  queryState,
});
```

If an app needs persistence on native, persist the `QueryParamsState` values in
app-owned storage and hydrate them into local state. Do not add native-specific
files to `@m5kdev/frontend`.

## App configuration

`@m5kdev/frontend` must not read Vite environment variables directly. Resolve
environment values in app code and pass them into `AppConfigProvider`.

Vite app:

```tsx
import {
  AppConfigProvider,
  AppTrpcQueryProvider,
  AuthProvider,
} from "@m5kdev/frontend";

const appUrl = import.meta.env.VITE_APP_URL;
const serverUrl = import.meta.env.VITE_SERVER_URL;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider
      config={{
        appName: "m5",
        appUrl,
        serverUrl,
      }}
    >
      <AppTrpcQueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </AppTrpcQueryProvider>
    </AppConfigProvider>
  );
}
```

Expo app:

```tsx
import {
  AppConfigProvider,
  AppTrpcQueryProvider,
  AuthProvider,
} from "@m5kdev/frontend";

const appUrl = process.env.EXPO_PUBLIC_APP_URL;
const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider
      config={{
        appName: "m5",
        appUrl: appUrl ?? "",
        serverUrl: serverUrl ?? "",
      }}
    >
      <AppTrpcQueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </AppTrpcQueryProvider>
    </AppConfigProvider>
  );
}
```

`AuthProvider` reads `serverUrl` from `AppConfigProvider` by default. If an app
needs custom auth behavior, create and inject the client from app code:

```tsx
import {
  AuthProvider,
  createM5KAuthClient,
} from "@m5kdev/frontend";

const authClient = createM5KAuthClient(serverUrl);

<AuthProvider authClient={authClient}>{children}</AuthProvider>;
```

You can also pass `baseURL` directly:

```tsx
<AuthProvider baseURL={serverUrl}>{children}</AuthProvider>
```

## File upload inputs

Upload hooks now normalize inputs to `Blob`. Web apps can pass a `File` because
`File` extends `Blob`. Native apps can pass a URI descriptor.

Web:

```ts
const { upload } = useFileUpload();
await upload("avatar", file);
```

Expo:

```ts
const { upload } = useFileUpload();
await upload("avatar", {
  uri: asset.uri,
  name: asset.fileName ?? "avatar.jpg",
  type: asset.mimeType ?? "image/jpeg",
  size: asset.fileSize,
});
```

Use the same input shape with `useS3Upload` and `useMultipartUpload`. If you
need to normalize outside the hook, import `resolveUploadBlob` from
`@m5kdev/frontend/modules/file/hooks/useS3Upload`.

## Dependency changes

Vite web apps that render shared web UI should depend on both packages:

```json
{
  "dependencies": {
    "@m5kdev/frontend": "workspace:*",
    "@m5kdev/web-ui": "workspace:*",
    "nuqs": "catalog:"
  }
}
```

Expo apps should depend on `@m5kdev/frontend` and native UI libraries only. Do
not add `@m5kdev/web-ui` to an Expo package unless that package is web-only.

```json
{
  "dependencies": {
    "@m5kdev/frontend": "workspace:*"
  }
}
```

## Search checks

Run these checks while migrating an app:

```bash
rg "@m5kdev/frontend/modules/.*/components/(App|Auth|Billing|.*Table|Nuqs)" apps packages
rg "@m5kdev/frontend/modules/table/hooks/useNuqs" apps packages
rg "from \"nuqs\"" packages/frontend apps/*/expo
rg "import\\.meta" packages/frontend
rg "@m5kdev/web-ui" apps/*/expo packages/frontend
```

Expected result:

- Web UI component imports come from `@m5kdev/web-ui`.
- `nuqs` imports exist only in Vite/web app code or `@m5kdev/web-ui`.
- `packages/frontend` has no `import.meta` reads.
- Expo packages import `@m5kdev/frontend`, not `@m5kdev/web-ui`.

## Migration checklist

1. Move app shell, auth UI, billing UI, table UI, and generic web component
   imports from `@m5kdev/frontend` to `@m5kdev/web-ui`.
2. Replace `@m5kdev/frontend` imports of `useNuqsTable`,
   `useNuqsQueryParams`, and `useDateRangeFilter` with `@m5kdev/web-ui`
   imports.
3. Rename `ListUsersNuqsInput` usage to `ListUsersQueryInput`.
4. Keep `NuqsAdapter` only in Vite/web app shells that use `nuqs`.
5. Use `useTableQueryParams` from `@m5kdev/frontend` for Expo or other
   platform-neutral screens.
6. Move `import.meta.env` reads to app code and pass config through
   `AppConfigProvider`, `AuthProvider baseURL`, or `createM5KAuthClient`.
7. Pass `Blob`/`File` on web and `{ uri, name, type, size }` on native for file
   uploads.
8. Remove any native-specific implementation files from `@m5kdev/frontend`; use
   app-level parameters instead.
