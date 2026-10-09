# File is an inventoried S3 object

File used to mix production local-disk uploads, unauthenticated S3-by-key, and optional inventory. 1.0 File is always a `files` row plus the S3 object at `(bucket, key)`. Client-facing operations load that row and check Grants (`read` / `write` / `delete`). Client bytes never land on the app server: the browser PUTs to a presigned URL after initiate, `GET /files/:id` 302s to a short-lived presigned GET after Grant `read` (cookie session), and tRPC `getDownloadUrl` returns that presign for cookieless Actors (API keys). tRPC (user and organization procedures) is the JSON API: list, initiate, finalize, get, getDownloadUrl, update (originalName/metadata only), delete. tRPC get returns the row; cookie UIs construct `/files/:id` from the id.

Other Services call FileService `getObject` / `putObject` in-process. Those skip Grants (trusted callers; routers must not use them) but still invent a File: allowlist bucket, server-generated key, fileTypes, ownership stamps. `putObject` writes S3 and inserts `UPLOADED` (no PENDING/finalize). Local disk is a non-production S3 adapter (mock S3 HTTP for client presigned URLs), not a File kind.

User delete marks `DELETED` immediately and hides the File. If Workflow is registered, a daily cron purges S3 for `DELETED` older than FileModule `deleteAfterDays` (default 30, min 1) and moves stale `PENDING` (older than 1 day) to `FAILED` after deleting any object. If Workflow is absent, delete purges S3 in the same request; `PENDING` orphans can linger.

Other entities link a File by File id (a DB relation). Clients build `/files/${id}` from that id. Do not store presigned URLs or S3 keys on those rows. GET `/files/:id` still checks File Grants only — read of a parent entity does not confer File read. FileModule does not own attachments or scan other tables; the service that deletes a parent must also delete the File if the File should go.

## Considered Options

- **Optional inventory / S3-only mode** — rejected: Grants and durable `/files/:id` URLs need a row.
- **Production local-disk Files (Multer `/upload/file`)** — rejected: production storage is S3; the disk adapter only stands in for S3 in tests and `pnpm dev`.
- **Unauthenticated GET/DELETE by object key** — rejected: the locator for bytes is File id; access is Grant-checked.
- **Proxy bytes through Express** — rejected: upload is client ↔ S3; download is 302 to a presign so the durable URL stays ours.
- **Always delete the S3 object in the delete request** — rejected when Workflow exists: retention is `deleteAfterDays`. Without Workflow there is no cron, so S3 delete stays in-request.
- **Per-delete Workflow job** — rejected: one daily sweep keyed by `deletedAt` / `createdAt`.
- **In-place replace of bytes** — rejected at 1.0: new bytes are a new File.
- **FileModule-owned attachments / inherited parent Grants** — rejected: linking is an app FK to File id; access stays File Grants (`read: org` when every Member should see org Files).
- **Cascade delete from parent tables** — rejected: FileModule does not scan other schemas; the parent’s Service deletes the File.
- **Internal get/put as Procedures with Grants** — rejected: they are unguarded Service methods; the calling Service owns authorization. They are not Procedures and are not mounted on tRPC.
- **Raw internal S3 with no files row** — rejected: `putObject`/`getObject` still go through inventory; only `accessGuard` is skipped.
