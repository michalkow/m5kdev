---
sidebar_position: 1
---

# File module

The file module covers browser uploads, S3 presigned URLs, upload inventory, and
download URL resolution.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | File type constants shared by backend validation and frontend UX. |
| `@m5kdev/backend` | `FileModule`, upload routes, S3 repository, inventory repository, and file service helpers. |
| `@m5kdev/frontend` | React hooks for local upload routes, direct S3 uploads, and S3 download URLs. |
| `@m5kdev/web-ui` | No file-specific UI module yet. App code can compose hooks with shared UI primitives. |

## Use cases

- Upload a file to the backend local upload route and receive a URL.
- Request a presigned S3 URL, upload directly from the browser, and store the S3 key.
- Use the inventory-backed S3 lifecycle when the app needs a DB row for ownership,
  status, metadata, and deletion.
- Resolve an S3 key to a short-lived download URL.

## Pages

- [Shared contracts](./shared)
- [Backend usage](./backend)
- [Frontend usage](./frontend)
- [End-to-end flow](./flow)
