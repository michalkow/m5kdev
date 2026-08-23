---
sidebar_position: 3
---

# Backend file usage

Backend file support lives in `@m5kdev/backend/modules/file/*`.

## Register the module

`FileModule` depends on auth and mounts an Express upload router. The default
mount path is `/upload`.

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { FileModule } from "@m5kdev/backend/modules/file/file.module";

export const builtBackendApp = createBackendApp(
  {
    db: { url: process.env.DATABASE_URL! },
  },
  [new AuthModule(), new FileModule()]
);
```

Use `new FileModule("/assets")` to mount the routes under a different prefix.
Grants default to `defaultFileGrants` (`read` / `write` / `delete`; user: own;
org owner/admin: org; org member: own).

## Environment

AWS is **optional**. `FileModule` constructs `FileS3Repository` at boot but
does not open an S3 client until an S3 method runs. Missing
`AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` returns
`INTERNAL_SERVER_ERROR` ("Missing AWS environment variables") on S3 calls
only.

S3 features need:

```sh
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_S3_ENDPOINT=...
```

`AWS_S3_ENDPOINT` is optional (S3-compatible providers). When set, the client
uses path-style access.

## Local inventory

`POST /upload/file/:type` (authenticated) stores the bytes on disk and calls
`FileService.recordLocalUpload`. When the inventory repository is configured
(always in `FileModule`):

- `bucket` is `local`
- `status` is `UPLOADED`
- Organization actors stamp `memberId`, `organizationId`, and `userId`
- User-only actors stamp `userId` (`memberId` null)
- MIME type must exist on `fileTypes` from `@m5kdev/commons` (`:type` is the
  category key, e.g. `image`)

Without inventory, local upload still returns a URL and skips the DB row.

## Routes

With the default mount path:

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

Prefer inventory-backed routes when the app needs ownership, metadata,
soft-delete state, or status tracking.

## tRPC

| Procedure | Auth | Description |
| --- | --- | --- |
| `file.list` | Organization | List inventory with the List query contract. Applies organization context filters, then `read` grants (`own` uses MemberId). |

`file.list` errors with `INTERNAL_SERVER_ERROR` if inventory is not configured.

## Service helpers

`FileService.recordLocalUpload` and `initiateS3Upload` / `finalizeS3Upload`
enforce `write` grants. S3 initiate without a configured bucket returns
`INTERNAL_SERVER_ERROR` ("S3 bucket is not configured").

```ts
const result = await fileService.initiateS3Upload(actor, {
  userId: actor.userId,
  memberId: actor.memberId,
  organizationId: actor.organizationId,
  contentType: file.type,
  originalName: file.name,
  sizeBytes: file.size,
  pathHint: "documents",
  metadata: { source: "profile-photo" },
});

if (result.isErr()) {
  throw result.error;
}

const { key, url, fileId } = result.value;
```

Service methods return `ServerResult` / `ServerResultAsync`. Unwrap them
through the normal backend result pattern.

## Constraints

- Org `"own"` compares `memberId`, not `userId`.
- Local upload `:type` must be a `fileTypes` key; unknown MIME is rejected.
- Do not treat AWS env as required for Starter Files — that path is local
  inventory only.
