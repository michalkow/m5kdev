---
sidebar_position: 3
---

# Frontend and Web UI split migration

`@m5kdev/frontend` is now the platform-neutral React package. Code in this
package must be importable from both Vite React web apps and Expo React Native
apps.

`@m5kdev/web-ui` owns web-only UI behavior and browser URL state, including the
`nuqs` table adapters.

## Ownership after the split

| Package | Use for |
| --- | --- |
| `@m5kdev/frontend` | App config, tRPC providers, auth client setup, session hooks, upload hooks, neutral table query state, query/filter serializers. |
| `@m5kdev/web-ui` | HeroUI/Tailwind components, auth/admin route UI, table UI, and `nuqs` URL query-state adapters. |

Keep browser-only APIs out of `@m5kdev/frontend`. Vite apps may still read
`import.meta.env` in app code, but pass the resolved values into frontend
providers or setup functions.

## Required import changes

Move imports for `nuqs`-backed table state from `@m5kdev/frontend` to
`@m5kdev/web-ui`.

| Old import | New import |
| --- | --- |
| `@m5kdev/frontend/modules/table/hooks/useNuqsTable` | `@m5kdev/web-ui/modules/table/hooks/useNuqsTable` |
| `@m5kdev/frontend/modules/table/hooks/useNuqsQueryParams` | `@m5kdev/web-ui/modules/table/hooks/useNuqsQueryParams` |
| `@m5kdev/frontend/modules/table/hooks/useDateRangeFilter` | `@m5kdev/web-ui/modules/table/hooks/useDateRangeFilter` |
| `ListUsersNuqsInput` from `@m5kdev/frontend/modules/auth/hooks/useAuthAdmin` | `ListUsersQueryInput` from the same module |

The neutral query integration hook stays in `@m5kdev/frontend`:

```ts
import { useQueryWithParams } from "@m5kdev/frontend/modules/table/hooks/useQueryWithParams";
```

The shared query/filter serializers now live in:

```ts
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
`@m5kdev/web-ui` and keep the app shell wrapped with `NuqsAdapter`.

```tsx
import useNuqsTable, {
  type TableParams,
} from "@m5kdev/web-ui/modules/table/hooks/useNuqsTable";

const { params, query } = useNuqsTable({
  getQueryOptions: postsQueryOptions,
  queryParams: { organizationId },
});
```

Web UI table components continue to come from `@m5kdev/web-ui`:

```tsx
import { NuqsTable } from "@m5kdev/web-ui/modules/table/components/NuqsTable";
```

## Expo or platform-neutral table usage

Expo apps must not import the `nuqs` hooks from `@m5kdev/web-ui`. Use the
in-memory neutral state hook from `@m5kdev/frontend`, then pass that state to
`useQueryWithParams`.

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

## Auth configuration

`@m5kdev/frontend` no longer reads Vite environment variables directly. Configure
the auth client from app code.

Vite app:

```tsx
import {
  AppConfigProvider,
  AuthProvider,
} from "@m5kdev/frontend";

const serverUrl = import.meta.env.VITE_SERVER_URL;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider serverUrl={serverUrl}>
      <AuthProvider>{children}</AuthProvider>
    </AppConfigProvider>
  );
}
```

Expo app:

```tsx
import {
  AppConfigProvider,
  AuthProvider,
} from "@m5kdev/frontend";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider serverUrl={serverUrl}>
      <AuthProvider>{children}</AuthProvider>
    </AppConfigProvider>
  );
}
```

If an app needs custom auth behavior, create and inject the client:

```tsx
import {
  AuthProvider,
  createM5KAuthClient,
} from "@m5kdev/frontend";

const authClient = createM5KAuthClient(serverUrl);

<AuthProvider authClient={authClient}>{children}</AuthProvider>;
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

Use the same input shape with `useS3Upload`.

## Migration checklist

1. Replace `@m5kdev/frontend` imports of `useNuqsTable`,
   `useNuqsQueryParams`, and `useDateRangeFilter` with `@m5kdev/web-ui`
   imports.
2. Rename `ListUsersNuqsInput` usage to `ListUsersQueryInput`.
3. Keep `NuqsAdapter` only in Vite/web app shells that use `nuqs`.
4. Use `useTableQueryParams` from `@m5kdev/frontend` for Expo or other
   platform-neutral screens.
5. Move `import.meta.env` reads to app code and pass `serverUrl` through
   `AppConfigProvider`, `AuthProvider baseURL`, or `createM5KAuthClient`.
6. Pass `Blob`/`File` on web and `{ uri, name, type, size }` on native for file
   uploads.
