---
"@m5kdev/backend": minor
"@m5kdev/frontend": minor
"@m5kdev/web-ui": minor
---

File is always an inventoried S3 object: clients initiate, PUT to a presigned URL, then finalize; Multer local upload and unauthenticated S3-by-key HTTP are removed.
Downloads are Grant-checked: cookie sessions use GET /files/:id (302), and cookieless Actors use getDownloadUrl.
list, get, update, and delete are Procedures on org and personal tRPC; only UPLOADED Files are visible, and delete hides immediately.
Other services put and get bytes through putObject/getObject, which still create or load a files row.
When Workflow is present, a daily cron purges stale PENDING and aged DELETED objects; without it, delete removes the S3 object in the same request.
useS3Upload runs initiate → PUT with progress → finalize and returns File id; useFileDownloadUrl calls getDownloadUrl for cookieless clients.
FileDropzone and AvatarUpload store File id and upload through that inventoried path.
