---
sidebar_position: 22
---

# Uploads directory

`packages/backend/src/modules/uploads/` is not a code module — it is the local
working directory where backend services write files at runtime.

## Who writes here

- The [file module](/modules/file) local upload route stores browser uploads
  here before they are served or pushed to S3.
- The [video module](/modules/video) writes ffmpeg outputs (trims, WAV/MP3
  conversions) here.

## Operational notes

- The directory is created automatically on startup.
- Contents are transient runtime artifacts; do not commit them and do not rely
  on them surviving deploys. Durable storage belongs in S3 via the
  [file module](/modules/file).
