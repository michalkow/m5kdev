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
| `@m5kdev/backend` | `VideoModule` and `VideoService` (ffmpeg-based). |

## Usage

```ts
backendApp.use(new VideoModule());
```

Files are processed in the backend `uploads/` working directory (created on
startup). Set `FFMPEG_PATH` if ffmpeg is not on the system path.

## Service API

| Method | Description |
| --- | --- |
| `cut(file, start, end)` | Trim a media file to the given time range |
| `webmToWav(input, hz?)` | Convert WebM audio to WAV (default 48 kHz) — the format `AIService.generateTranscript` expects |
| `extractAudioMp3(input, kbps?, streamIndex?)` | Extract an audio track to MP3 |

All methods return `ServerResultAsync<string>` with the output file path.
