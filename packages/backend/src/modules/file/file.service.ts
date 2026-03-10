import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { ServerResult, ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";
import type { FileRepository } from "#modules/file/file.repository";

export class FileService extends BaseService<{ file: FileRepository }, never> {
  isS3Path(path: string): boolean {
    return path.startsWith("s3::");
  }

  parseS3Path(S3Path: string): ServerResult<{ bucket: string; path: string }> {
    if (!this.isS3Path(S3Path)) {
      return this.error("BAD_REQUEST", "Invalid S3 path");
    }
    const [bucket, path] = S3Path.split("s3::")[1].split("//");
    return ok({ bucket, path });
  }

  wrapS3Path(path: string, bucket: string): string {
    return `s3::${bucket}//${path}`;
  }

  getS3UploadUrl(
    filename: string,
    filetype: string,
    expiresIn = 60 * 5
  ): ServerResultAsync<string> {
    return this.repository.file.getS3UploadUrl(filename, filetype, expiresIn);
  }

  getS3DownloadUrl(path: string, expiresIn = 60 * 5): ServerResultAsync<string> {
    return this.repository.file.getS3DownloadUrl(path, expiresIn);
  }

  getS3Object(path: string) {
    return this.repository.file.getS3Object(path);
  }

  deleteS3Object(path: string) {
    return this.repository.file.deleteS3Object(path);
  }

  async uploadFileToS3(localPath: string, returnDownloadUrl = false): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const extension = localPath.split(".").pop()?.toLowerCase();
      const filename = `${uuidv4()}${extension ? `.${extension}` : ""}`;

      const mimeByExt: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        mp4: "video/mp4",
        mov: "video/mov",
        avi: "video/avi",
        mkv: "video/mkv",
        webm: "video/webm",
        mp3: "audio/mp3",
        wav: "audio/wav",
        m4a: "audio/m4a",
      };
      const filetype = (extension && mimeByExt[extension]) || "application/octet-stream";

      const presigned = await this.getS3UploadUrl(filename, filetype);
      if (presigned.isErr()) return err(presigned.error);

      const file = await readFile(localPath);
      const res = await fetch(presigned.value, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": filetype },
      });
      if (!res.ok) {
        return this.error("INTERNAL_SERVER_ERROR", `Failed to upload to S3: ${res.status}`);
      }
      if (returnDownloadUrl) {
        const downloadUrl = await this.getS3DownloadUrl(filename);
        if (downloadUrl.isErr()) return err(downloadUrl.error);
        return ok(downloadUrl.value);
      }

      return ok(filename);
    });
  }

  async downloadS3ToFile(s3Path: string): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const extension = s3Path.split(".").pop();
      const destinationPath = path.join(
        tmpdir(),
        "s3-downloads",
        `${uuidv4()}${extension ? `.${extension}` : ""}`
      );

      const result = await this.repository.file.getS3Object(s3Path);
      if (result.isErr()) return err(result.error);

      const body = result.value.Body;
      if (!body) return this.error("NOT_FOUND", "S3 object body is empty");

      await mkdir(dirname(destinationPath), { recursive: true });

      // AWS SDK v3 SdkStream has transformToByteArray method - use it for reliable handling
      if (
        typeof body === "object" &&
        "transformToByteArray" in body &&
        typeof body.transformToByteArray === "function"
      ) {
        const bytes = await body.transformToByteArray();
        await writeFile(destinationPath, bytes);
        return ok(destinationPath);
      }

      // Fallback: try streaming approaches
      const writeStream = createWriteStream(destinationPath);
      let input: NodeJS.ReadableStream | null = null;
      const unknownBody: unknown = body;

      if (
        typeof unknownBody === "object" &&
        unknownBody !== null &&
        "pipe" in unknownBody &&
        typeof (unknownBody as { pipe?: unknown }).pipe === "function"
      ) {
        input = unknownBody as NodeJS.ReadableStream;
      } else if (
        typeof unknownBody === "object" &&
        unknownBody !== null &&
        "getReader" in unknownBody &&
        typeof (unknownBody as { getReader?: unknown }).getReader === "function"
      ) {
        input = Readable.fromWeb(unknownBody as unknown as globalThis.ReadableStream);
      } else if (
        typeof unknownBody === "object" &&
        unknownBody !== null &&
        "stream" in unknownBody &&
        typeof (unknownBody as { stream?: unknown }).stream === "function"
      ) {
        input = Readable.fromWeb(
          (unknownBody as { stream: () => globalThis.ReadableStream }).stream()
        );
      }

      if (input) {
        await pipeline(input, writeStream);
        return ok(destinationPath);
      }

      if (
        typeof unknownBody === "object" &&
        unknownBody !== null &&
        "arrayBuffer" in unknownBody &&
        typeof (unknownBody as { arrayBuffer?: unknown }).arrayBuffer === "function"
      ) {
        const buffer = Buffer.from(
          await (unknownBody as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer()
        );
        await pipeline(Readable.from(buffer), writeStream);
        return ok(destinationPath);
      }

      return this.error("INTERNAL_SERVER_ERROR", "Unsupported S3 body type");
    });
  }

  getFileType(path: string): { fileType: keyof typeof fileTypes; extension: string } | undefined {
    // determine the type of the file
    const extension = path.split(".").pop();
    if (!extension) return undefined;

    for (const [key, value] of Object.entries(fileTypes)) {
      if (value.extensions.includes(extension)) {
        return { fileType: key, extension };
      }
    }
    return undefined;
  }
}
