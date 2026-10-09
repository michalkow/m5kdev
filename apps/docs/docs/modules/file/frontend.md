---
sidebar_position: 4
---

# Frontend file usage

Frontend hooks live in `@m5kdev/frontend/modules/file/hooks/*`.

They need `AppConfigProvider` (`serverUrl`) and `AppTrpcQueryProvider`.

```tsx
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider
      config={{
        appName: "My App",
        appUrl: import.meta.env.VITE_APP_URL,
        serverUrl: import.meta.env.VITE_SERVER_URL,
      }}
    >
      {children}
    </AppConfigProvider>
  );
}
```

## Upload (initiate → PUT → finalize)

`useS3Upload` is the production upload hook. It calls tRPC `initiate`, PUTs
bytes to the returned URL (with progress), then `finalize`. It returns the
**File id**. Store that id on your domain row.

```tsx
import { useS3Upload } from "@m5kdev/frontend/modules/file/hooks/useS3Upload";

export function ImageUploader() {
  const { upload, progress, status, error } = useS3Upload({ scope: "organization" });

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("file");
        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
        if (!file) return;
        const fileId = await upload(file);
        console.log(fileId);
      }}
    >
      <input name="file" type="file" />
      <button type="submit">Upload</button>
      <output>{status === "uploading" ? `${progress}%` : error}</output>
    </form>
  );
}
```

Use `scope: "user"` for personal Files (`file.user.*`), including user avatar
upload. Organization Files (Starter `/files`, org logo) use the default
`organization` scope.

Web apps can pass a `File`. Native apps can pass `{ uri, name, type, size }`.
`resolveUploadBlob` is exported from the same module if you need to normalize
outside the hook.

## Download

Cookie UIs link to `/files/${id}` on the API origin (`fileCookieDownloadUrl`).
That GET 302s to a short-lived presigned URL after Grant `read`.

```tsx
import { fileCookieDownloadUrl } from "@m5kdev/frontend/modules/file/hooks/useS3DownloadUrl";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";

export function FileOpenLink({ fileId }: { fileId: string }) {
  const { serverUrl } = useAppConfig();
  return <a href={fileCookieDownloadUrl(serverUrl, fileId)}>Open</a>;
}
```

`fileDisplayUrl` treats HTTP(S) values as OAuth avatars and File ids as
`/files/${id}`. Cookieless Actors should call tRPC `getDownloadUrl` instead of
the cookie path.

Do not store the presigned URL. Store File id and construct the path when needed.
