import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
//
import ffbin from "ffmpeg-ffprobe-static";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const resolveFfmpegPath = (): string => {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const staticPath = ffbin.ffmpegPath;
  if (typeof staticPath === "string" && existsSync(staticPath)) return staticPath;

  return "ffmpeg";
};

const runFfmpeg = async (args: readonly string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath();
    const child = spawn(ffmpegPath, [...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      const details = [
        "Failed to spawn ffmpeg.",
        `Resolved ffmpeg path: ${ffmpegPath}`,
        `FFMPEG_PATH: ${process.env.FFMPEG_PATH ?? "(unset)"}`,
        `ffmpeg-ffprobe-static ffmpegPath: ${ffbin.ffmpegPath ?? "(missing)"}`,
      ].join("\n");
      reject(new Error(`${details}\n\n${String(error)}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code ?? "unknown"}`));
    });
  });
};

export class VideoService extends BaseService<never, never> {
  async cut(file: string, start: number, end: number): ServerResultAsync<string> {
    const duration = end - start;
    const output = path.join(uploadsDir, `${uuidv4()}.mp4`);
    if (!existsSync(output)) {
      closeSync(openSync(output, "w"));
    }

    const ffmpegResult = await this.throwablePromise(() =>
      runFfmpeg([
        "-i",
        file,
        "-ss",
        String(start),
        "-t",
        String(duration),
        "-c:v",
        "libx264",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        output,
      ])
    );
    if (ffmpegResult.isErr()) return err(ffmpegResult.error);

    return ok(output);
  }

  async webmToWav(input: string, hz = 48000): ServerResultAsync<string> {
    const output = path.join(uploadsDir, `${uuidv4()}.wav`);
    if (!existsSync(output)) {
      closeSync(openSync(output, "w"));
    }

    const ffmpegResult = await this.throwablePromise(() =>
      runFfmpeg([
        "-i",
        input,
        "-vn",
        "-c:a",
        "pcm_s16le",
        "-ar",
        String(hz),
        "-ac",
        "2",
        "-f",
        "wav",
        "-y",
        output,
      ])
    );
    if (ffmpegResult.isErr()) return err(ffmpegResult.error);
    return ok(output);
  }

  async extractAudioMp3(input: string, kbps = 192, streamIndex = 0): ServerResultAsync<string> {
    const output = path.join(uploadsDir, `${uuidv4()}.mp3`);
    if (!existsSync(output)) {
      closeSync(openSync(output, "w"));
    }

    const ffmpegResult = await this.throwablePromise(() =>
      runFfmpeg([
        "-i",
        input,
        "-map",
        `0:a:${streamIndex}`,
        "-c:a",
        "libmp3lame",
        "-b:a",
        `${kbps}k`,
        "-y",
        output,
      ])
    );
    if (ffmpegResult.isErr()) return err(ffmpegResult.error);

    return ok(output);
  }
}
