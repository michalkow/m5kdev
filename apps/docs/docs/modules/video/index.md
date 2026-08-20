---
sidebar_position: 24
---

# Video module

The video module wraps ffmpeg for common media transformations on uploaded
audio/video files — trimming and audio extraction for features like
transcription.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/module-video` | `VideoModule` and `VideoService` (ffmpeg-based). |

## Usage

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { VideoModule } from "@m5kdev/module-video";

createBackendApp(config, [new VideoModule()]);
```

Files are processed in an `uploads/` working directory. Set `FFMPEG_PATH` if
ffmpeg is not on the system path.

## Service API

| Method | Description |
| --- | --- |
| `cut(file, start, end)` | Trim a media file to the given time range |
| `webmToWav(input, hz?)` | Convert WebM audio to WAV (default 48 kHz) — the format `AIService.generateTranscript` expects |
| `extractAudioMp3(input, kbps?, streamIndex?)` | Extract an audio track to MP3 |

All methods return `ServerResultAsync<string>` with the output file path.
