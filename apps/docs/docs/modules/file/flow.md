---
sidebar_position: 5
---

# End-to-end file flow

Preferred path: Grant-checked Procedures, browser PUT to S3, durable File id.

## 1. Register backend modules

Register Auth before File. Add Workflow when you want delayed S3 purge.

```ts
export const builtBackendApp = createBackendApp(
  {
    db: { url: process.env.DATABASE_URL! },
  },
  [new AuthModule(), new FileModule(), new WorkflowModule({ /* queues */ })] as const
);
```

## 2. Initiate

Call tRPC `file.initiate` (or `file.user.initiate`) with metadata. The row is
`PENDING`. The response includes `fileId` and a PUT `url`.

## 3. PUT bytes

PUT the file to `url` with `Content-Type` matching initiate. The app CORS config
must allow that browser PUT (methods include PUT; allow `Content-Type`).

## 4. Finalize

Call `file.finalize` with `{ fileId }`. The row becomes `UPLOADED`, or `FAILED`
if the object is missing.

## 5. Store File id

Store `fileId` on the domain record. Clients build `/files/${fileId}`. Do not
store the presigned URL or the S3 key.

Open in a cookie UI with `GET /files/:id`. API keys use `getDownloadUrl`.

## Delete

tRPC `file.delete` hides the File immediately (`DELETED`). Without Workflow, S3
is deleted in that request. With Workflow, a daily cron purges objects for
`DELETED` older than `deleteAfterDays` and stale `PENDING` older than one day.

## In-process bytes

Other Services call `putObject` / `getObject` on `FileService`. Those skip
Grants; the caller authorizes. They still create or load an inventory row.

## Failure handling

- If presigning fails after insert, the row is `FAILED`.
- If PUT succeeds but finalize fails, retry finalize before starting a new
  upload.
- There is no undelete after `delete`.
