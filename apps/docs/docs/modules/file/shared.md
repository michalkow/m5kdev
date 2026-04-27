---
sidebar_position: 2
---

# Shared file contracts

Shared file constants live in `@m5kdev/commons/modules/file/file.constants`.

```ts
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
```

`fileTypes` is keyed by upload category:

| Type | MIME types | Extensions |
| --- | --- | --- |
| `image` | `image/jpeg`, `image/png`, `image/jpg`, `image/webp` | `jpg`, `jpeg`, `png`, `webp` |
| `video` | `video/mp4`, `video/mov`, `video/avi`, `video/mkv`, `video/webm` | `mp4`, `mov`, `avi`, `mkv` |
| `audio` | `audio/mp3`, `audio/wav`, `audio/m4a`, `audio/webm` | `mp3`, `wav`, `m4a`, `webm` |

The backend upload router uses this map to validate local upload MIME types. Apps
can also read the same map when building accept lists for file pickers.

```tsx
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";

const imageAccept = fileTypes.image.mimetypes.join(",");

export function ImageInput() {
  return <input type="file" accept={imageAccept} />;
}
```

Keep new file categories in `@m5kdev/commons` first so backend validation and
frontend inputs stay aligned.
