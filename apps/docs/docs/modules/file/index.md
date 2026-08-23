---
sidebar_position: 1
---

# File module

The file module covers browser uploads, local-disk inventory, optional S3
presigned URLs, and download URL resolution.

`FileModule` **boots without AWS**. Local multipart uploads and `file.list` work
with only Auth + a database. S3 clients are created lazily; missing AWS env
fails S3 routes, not Kernel startup.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | File type constants shared by backend validation and frontend UX. |
| `@m5kdev/backend` | `FileModule`, upload routes, lazy S3 repository, inventory repository, `FileService`, `file.list`. |
| `@m5kdev/frontend` | React hooks for local upload routes, direct S3 uploads, and S3 download URLs. |
| `@m5kdev/web-ui` | No file-specific UI module. Starter ships an app Files route when the `files` create flag is on. |

## Use cases

- Upload to the local route (`POST /upload/file/:type`) and get a URL. The
  service writes an inventory row (`bucket` = `local`) and stamps **MemberId**
  (`memberId`) for Organization actors.
- List org-scoped inventory with `file.list` (organization procedure, List
  query, `read` grant).
- Request a presigned S3 URL, upload from the browser, and store the S3 key.
- Use the inventory-backed S3 lifecycle when the app needs a DB row for
  ownership, status, metadata, and deletion.
- Resolve an S3 key to a short-lived download URL.

## create-m5kdev

Selecting `files` registers `FileModule`, exports the `files` table, and mounts
the webapp `/files` route. `--yes` does not enable it. AWS is not required for
that Starter path.

## Pages

- [Shared contracts](./shared)
- [Backend usage](./backend)
- [Frontend usage](./frontend)
- [End-to-end flow](./flow)
