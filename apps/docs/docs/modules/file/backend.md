---
sidebar_position: 3
---

# Backend file usage

Backend file support lives in `@m5kdev/backend/modules/file/*`.

## Register the module

`FileModule` depends on auth and mounts an Express upload router. The default mount
path is `/upload`.

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { FileModule } from "@m5kdev/backend/modules/file/file.module";
import express from "express";

const expressApp = express();

export const backendApp = createBackendApp({
  db: { url: process.env.DATABASE_URL! },
  express: expressApp,
})
  .use(new AuthModule())
  .use(new FileModule());
```

Use `new FileModule("/assets")` to mount the routes under a different prefix.

## Environment

S3 features require these environment variables:

```sh
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_S3_ENDPOINT=...
```

`AWS_S3_ENDPOINT` is optional and is used for S3-compatible providers. When it is
present, the S3 client uses path-style access.

## Routes

With the default mount path, the module exposes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/upload/file/:type` | Local multipart upload. `:type` must exist in `fileTypes`. |
| `GET` | `/upload/file/:filename` | Serve a file stored by the local upload route. |
| `GET` | `/upload/files/:path` | Resolve an S3 key to a presigned download URL. |
| `POST` | `/upload/s3-presigned-url` | Create a direct S3 upload URL for a supplied key and MIME type. |
| `DELETE` | `/upload/files/:path(*)` | Delete an S3 object by key. |
| `POST` | `/upload/s3/initiate` | Authenticated inventory-backed S3 upload initialization. |
| `POST` | `/upload/s3/finalize` | Authenticated inventory-backed upload finalization. |
| `DELETE` | `/upload/files/by-id/:fileId` | Authenticated owner-only inventory deletion. |

Prefer the inventory-backed routes when the app needs ownership, metadata,
soft-delete state, or status tracking.

## Service helpers

`FileService` wraps S3 path handling, presigned URLs, object deletion, and
inventory-backed lifecycle operations.

```ts
const result = await services.file.file.initiateS3Upload({
  userId,
  organizationId,
  contentType: file.type,
  originalName: file.name,
  sizeBytes: file.size,
  metadata: { source: "profile-photo" },
});

if (result.isErr()) {
  throw result.error;
}

const { key, url, fileId } = result.value;
```

Service methods return `ServerResult` or `ServerResultAsync`, so callers should
unwrap them through the normal backend result pattern.
