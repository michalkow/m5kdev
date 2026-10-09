---
sidebar_position: 3
---

# Backend file usage

Backend file support lives in `@m5kdev/backend/modules/file/*`.

## Register the module

`FileModule` depends on Auth. It optional-depends on Workflow for the daily
purge cron. Production File HTTP is only `GET /files/:id`.

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { FileModule } from "@m5kdev/backend/modules/file/file.module";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";

export const builtBackendApp = createBackendApp(
  {
    db: { url: process.env.DATABASE_URL! },
  },
  [
    new AuthModule(),
    new FileModule({
      buckets: [process.env.AWS_S3_BUCKET!],
      deleteAfterDays: 30,
      fileTypes: {
        document: { mimetypes: ["application/pdf"], extensions: ["pdf"] },
      },
    }),
    new WorkflowModule({
      queues: { fast: { concurrency: 5 } },
      defaultQueue: "fast",
    }),
  ]
);
```

`deleteAfterDays` defaults to 30. Values below 1 are invalid when Workflow is
present. Without Workflow, user delete removes the S3 object in the same request.

`fileTypes` on `FileModule` replaces the commons MIME allowlist for initiate and
`putObject`. Omit it to use `@m5kdev/commons` `fileTypes`.

In `pnpm dev` and tests, File uses `LocalFileObjectStore` and mounts mock S3 at
`/file-s3-mock`. `NODE_ENV=production` uses AWS S3 and does not mount the mock.

## Environment

```sh
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_S3_ENDPOINT=...
VITE_SERVER_URL=http://localhost:PORT
```

`AWS_S3_ENDPOINT` is optional (S3-compatible providers; path-style access).

The app CORS config must allow browser `PUT` to the presigned (or mock S3) URL,
including the `Content-Type` header, from the web origin.

## HTTP

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/files/:id` | Cookie session. Grant `read`, then 302 to a short-lived presigned GET. |

tRPC is the JSON API: `file.*` (organization Actor) and `file.user.*` (personal).
Procedures: `list`, `get`, `initiate`, `finalize`, `getDownloadUrl`, `update`,
`delete`. `get` returns the inventory row, not a download URL.

## Procedures vs `putObject` / `getObject`

Procedures are Grant-checked (`read` / `write` / `delete`). Use them from tRPC
and cookie download.

`putObject` and `getObject` are in-process Service methods for other Services.
They still invent a File (allowlisted bucket, server-generated key, `fileTypes`,
ownership stamps) but skip Grants. They are not Procedures and are not mounted
on tRPC. The calling Service owns authorization. Routers must not call them.

```ts
const put = await services.file.putObject({
  body,
  contentType: "image/png",
  originalName: "shot.png",
  userId,
  memberId,
  organizationId,
});
```

`update` may change `originalName` and `metadata` only. Bytes are not replaced
in place; new bytes are a new File.

## Linking and Grants

Other entities store File id. Do not store presigned URLs or S3 keys. Parent
Services delete the File when the parent goes; FileModule does not cascade.
File Grants do not inherit from the parent. Use `read: org` when every Member
should see organization Files.

## Delete and purge

`delete` marks `DELETED` immediately. get/list/`GET /files/:id` return not
found. There is no undelete.

When Workflow is registered, cron `file.purge` runs daily (`0 0 * * *`):

- `PENDING` older than 1 day (`createdAt`) → `FAILED` and any S3 object is
  deleted. That TTL is not configurable.
- `DELETED` older than `deleteAfterDays` → S3 object deleted.

Purge does not emit a Server event.

Service methods return `ServerResult` / `ServerResultAsync`.
