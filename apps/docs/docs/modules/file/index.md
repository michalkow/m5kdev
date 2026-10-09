---
sidebar_position: 1
---

# File module

File 1.0 is an inventoried S3 object: a `files` row plus the object at
`(bucket, key)`. Client operations load that row and check Grants. Decision
record: ADR-0030 (`docs/adr/0030-file-is-inventoried-s3-object.md`).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `fileTypes` shared by backend validation and frontend accept lists. |
| `@m5kdev/backend` | `FileModule`, inventory, S3 port (AWS or local adapter), Procedures, `GET /files/:id`. |
| `@m5kdev/frontend` | `useS3Upload` (initiate → PUT → finalize), File id download URL helpers. |
| `@m5kdev/web-ui` | `AvatarUpload` and `FileDropzone` store File id and display `/files/${id}`. |

## Use cases

- Store File id on other entities; clients construct `/files/${id}`.
- Browser upload: Grant-checked initiate, PUT to S3, finalize.
- Cookie download: `GET /files/:id` 302. API keys: `getDownloadUrl`.
- Other Services write/read bytes with unguarded `putObject` / `getObject`.

## Pages

- [Shared contracts](./shared)
- [Backend usage](./backend)
- [Frontend usage](./frontend)
- [End-to-end flow](./flow)
