---
sidebar_position: 5
---

# End-to-end file flow

This is the preferred flow when an app needs durable file records and direct S3
uploads.

## 1. Register backend modules

Register auth before file because `FileModule` depends on auth.

```ts
export const backendApp = createBackendApp({
  db: { url: process.env.DATABASE_URL! },
  express: app,
})
  .use(new AuthModule())
  .use(new FileModule());
```

## 2. Initiate the upload

Call `POST /upload/s3/initiate` from an authenticated browser session with the
file metadata.

```ts
const initRes = await fetch(`${serverUrl}/upload/s3/initiate`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    originalName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    pathHint: "documents",
    metadata: { entity: "contract" },
  }),
});

if (!initRes.ok) throw new Error("Failed to initiate upload");

const init = (await initRes.json()) as {
  key: string;
  url: string;
  fileId?: string;
};
```

## 3. Upload to S3

Use the presigned URL returned by the backend.

```ts
const uploadRes = await fetch(init.url, {
  method: "PUT",
  headers: { "Content-Type": file.type },
  body: file,
});

if (!uploadRes.ok) throw new Error("Failed to upload file");
```

## 4. Finalize the upload

If `fileId` is present, mark the inventory row as uploaded.

```ts
if (init.fileId) {
  const finalizeRes = await fetch(`${serverUrl}/upload/s3/finalize`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId: init.fileId,
      etag: uploadRes.headers.get("etag") ?? undefined,
    }),
  });

  if (!finalizeRes.ok) throw new Error("Failed to finalize upload");
}
```

## 5. Store the key

Store `init.key` in the app's domain record. Use the key later with
`useS3DownloadUrl` or `GET /upload/files/:path`.

## Failure handling

- If presigning fails after inventory creation, the backend marks the row as
  `FAILED`.
- If upload succeeds but finalization fails, retry finalization before creating a
  duplicate upload.
- Use `DELETE /upload/files/by-id/:fileId` for authenticated inventory-backed
  deletion.
