import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
//
import ffbin from "ffmpeg-ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";

if (!ffbin.ffmpegPath || !ffbin.ffprobePath) {
  throw new Error("FFmpeg or FFprobe not found");
}

ffmpeg.setFfmpegPath(ffbin.ffmpegPath);
ffmpeg.setFfprobePath(ffbin.ffprobePath);

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

export class VideoService extends BaseService<never, never> {
  async cut(file: string, start: number, end: number): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const duration = end - start;
      const output = path.join(uploadsDir, `${uuidv4()}.mp4`);
      if (!existsSync(output)) {
        closeSync(openSync(output, "w"));
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(file)
          .seekOutput(start)
          .videoCodec("libx264")
          .audioCodec("copy")
          .outputOptions(["-y", "-movflags +faststart"])
          .duration(duration)
          .on("end", () => resolve())
          .on("error", (e: Error, _stdout: string | null, _stderr: string | null) => reject(e))
          .save(output);
      }).catch((error) => err(this.handleUnknownError(error)));

      return ok(output);
    });
  }

  async webmToWav(input: string, hz = 48000): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const output = path.join(uploadsDir, `${uuidv4()}.wav`);
      if (!existsSync(output)) {
        closeSync(openSync(output, "w"));
      }
      await new Promise<void>((resolve, reject) => {
        ffmpeg(input)
          .noVideo()
          .audioCodec("pcm_s16le") // WAV PCM 16-bit
          .audioFrequency(hz) // 48000 or 44100
          .audioChannels(2) // down/up-mix as needed
          .format("wav")
          .outputOptions(["-y"])
          .on("end", () => resolve())
          .on("error", reject)
          .save(output);
      }).catch((error) => err(this.handleUnknownError(error)));
      return ok(output);
    });
  }

  async extractAudioMp3(input: string, kbps = 192, streamIndex = 0): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const output = path.join(uploadsDir, `${uuidv4()}.mp3`);
      if (!existsSync(output)) {
        closeSync(openSync(output, "w"));
      }
      await new Promise<void>((resolve, reject) => {
        ffmpeg(input)
          .outputOptions(["-y", `-map 0:a:${streamIndex}`])
          .audioCodec("libmp3lame")
          .audioBitrate(kbps)
          .on("end", () => resolve())
          .on("error", reject)
          .save(output);
      }).catch((error) => err(this.handleUnknownError(error)));

      return ok(output);
    });
  }
}
