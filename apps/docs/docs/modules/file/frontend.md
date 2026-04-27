---
sidebar_position: 4
---

# Frontend file usage

Frontend file hooks live in `@m5kdev/frontend/modules/file/hooks/*`.

All hooks read `serverUrl` from `AppConfigProvider`, unless a hook accepts an
explicit override.

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

## Local upload route

Use `useFileUpload` for a single multipart upload to `/upload/file/:type`.

```tsx
import { useFileUpload } from "@m5kdev/frontend/modules/file/hooks/useUpload";

export function AvatarUploader() {
  const upload = useFileUpload();

  return (
    <input
      type="file"
      accept="image/*"
      onChange={async (event) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;

        const response = await upload.upload<{
          url: string;
          mimetype: string;
          size: number;
        }>("image", file);

        console.log(response.url);
      }}
    />
  );
}
```

Use `useMultipartUpload` when the UI needs a queue and overall progress across
multiple files.

## Direct S3 upload

Use `useS3Upload` when the browser should upload directly to S3 through a
presigned URL.

```tsx
import { useS3Upload } from "@m5kdev/frontend/modules/file/hooks/useS3Upload";

export function DirectS3Uploader() {
  const { upload, progress, status, error } = useS3Upload();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("file");
        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
        if (!file) return;

        const key = await upload(file, "documents");
        console.log(key);
      }}
    >
      <input name="file" type="file" />
      <button type="submit">Upload</button>
      <output>{status === "uploading" ? `${progress}%` : error}</output>
    </form>
  );
}
```

The hook returns the object key. Store that key in your app data model if the file
needs to be downloaded later.

## Download URL

Use `useS3DownloadUrl` to exchange an S3 key for a temporary download URL.

```tsx
import { useS3DownloadUrl } from "@m5kdev/frontend/modules/file/hooks/useS3DownloadUrl";

export function DownloadLink({ filePath }: { filePath: string }) {
  const download = useS3DownloadUrl(filePath);

  if (download.isLoading) return <span>Preparing link</span>;
  if (download.isError) return <span>Download unavailable</span>;

  return <a href={download.data}>Download</a>;
}
```
