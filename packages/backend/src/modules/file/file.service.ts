import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type { FileRepository, FileS3Repository } from "./file.repository";
import type {
  FinalizeS3UploadInput,
  InitiateS3UploadInput,
  InitiateS3UploadResult,
} from "./file.types";
import { buildS3ObjectKey, extractOriginalExtension } from "./file.utils";

/** Pass `file` when Drizzle inventory is available; omit it for S3-only (presign / get / delete) behavior. */
export type FileServiceRepositories = {
  fileS3: FileS3Repository;
  file?: FileRepository;
};

export class FileService extends BaseService<
  { fileS3: FileS3Repository } & Partial<{ file: FileRepository }>,
  never
> {
  isS3Path(pathValue: string): boolean {
    return pathValue.startsWith("s3::");
  }

  parseS3Path(S3Path: string): ServerResult<{ bucket: string; path: string }> {
    if (!this.isS3Path(S3Path)) {
      return this.error("BAD_REQUEST", "Invalid S3 path");
    }
    const [bucket, pathPart] = S3Path.split("s3::")[1].split("//");
    return ok({ bucket, path: pathPart });
  }

  wrapS3Path(pathValue: string, bucket: string): string {
    return `s3::${bucket}//${pathValue}`;
  }

  getS3UploadUrl(key: string, filetype: string, expiresIn = 60 * 5): ServerResultAsync<string> {
    return this.repository.fileS3.getS3UploadUrl(key, filetype, expiresIn);
  }

  getS3DownloadUrl(key: string, expiresIn = 60 * 5): ServerResultAsync<string> {
    return this.repository.fileS3.getS3DownloadUrl(key, expiresIn);
  }

  getS3Object(key: string) {
    return this.repository.fileS3.getS3Object(key);
  }

  /**
   * Deletes the object in S3. If a `FileRepository` is configured and a matching inventory row exists for the bucket, it is soft-deleted.
   */
  async deleteS3Object(key: string): ServerResultAsync<void> {
    const deleteResult = await this.repository.fileS3.deleteS3Object(key);
    if (deleteResult.isErr()) return err(deleteResult.error);

    const fileRepo = this.repository.file;
    if (!fileRepo) {
      return ok(undefined);
    }

    const bucket = this.repository.fileS3.getBucket();
    if (!bucket) {
      return ok(undefined);
    }

    const rowResult = await fileRepo.findActiveByBucketAndKey(bucket, key);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return ok(undefined);
    }

    const soft = await fileRepo.softDeleteUploadById(row.id);
    if (soft.isErr()) return err(soft.error);
    return ok(undefined);
  }

  async initiateS3Upload(input: InitiateS3UploadInput): ServerResultAsync<InitiateS3UploadResult> {
    const bucket = this.repository.fileS3.getBucket();
    if (!bucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }

    const originalExtension = extractOriginalExtension(input.originalName);
    const key = buildS3ObjectKey({
      userId: input.userId,
      organizationId: input.organizationId,
      teamId: input.teamId,
      extension: originalExtension,
      pathHint: input.pathHint,
    });

    const fileRepo = this.repository.file;
    if (!fileRepo) {
      const urlResult = await this.repository.fileS3.getS3UploadUrl(key, input.contentType);
      if (urlResult.isErr()) return err(urlResult.error);
      return ok({ key, url: urlResult.value });
    }

    const createdResult = await fileRepo.create({
      bucket,
      key,
      originalName: input.originalName,
      originalExtension,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      metadata: input.metadata,
      status: "PENDING",
      userId: input.userId,
      organizationId: input.organizationId,
      teamId: input.teamId,
    });
    if (createdResult.isErr()) return err(createdResult.error);

    const row = createdResult.value;
    const urlResult = await this.repository.fileS3.getS3UploadUrl(key, input.contentType);
    if (urlResult.isErr()) {
      const failed = await fileRepo.markFailedById(row.id);
      if (failed.isErr()) return err(failed.error);
      return err(urlResult.error);
    }

    return ok({
      fileId: row.id,
      key,
      url: urlResult.value,
    });
  }

  async finalizeS3Upload(input: FinalizeS3UploadInput): ServerResultAsync<void> {
    const fileRepo = this.repository.file;
    if (!fileRepo) {
      return this.error("BAD_REQUEST", "File inventory is not configured");
    }

    const rowResult = await fileRepo.findActiveByIdForUser(input.fileId, input.userId);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return this.error("NOT_FOUND", "File not found");
    }

    if (row.status === "UPLOADED") {
      return ok(undefined);
    }

    if (row.status !== "PENDING") {
      return this.error("BAD_REQUEST", "File cannot be finalized in its current state");
    }

    const updated = await fileRepo.updateStatusById(input.fileId, {
      status: "UPLOADED",
      etag: input.etag ?? null,
      uploadedAt: new Date(),
    });
    if (updated.isErr()) return err(updated.error);
    return ok(undefined);
  }

  async deleteUploadedFileById(fileId: string, userId: string): ServerResultAsync<void> {
    const fileRepo = this.repository.file;
    if (!fileRepo) {
      return this.error("BAD_REQUEST", "File inventory is not configured");
    }

    const rowResult = await fileRepo.findActiveByIdForUser(fileId, userId);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return this.error("NOT_FOUND", "File not found");
    }

    const s3Result = await this.repository.fileS3.deleteS3Object(row.key);
    if (s3Result.isErr()) return err(s3Result.error);

    const soft = await fileRepo.softDeleteUploadById(row.id);
    if (soft.isErr()) return err(soft.error);
    return ok(undefined);
  }

  async uploadFileToS3(localPath: string, returnDownloadUrl = false): ServerResultAsync<string> {
    const extension = localPath.split(".").pop()?.toLowerCase();
    const key = `${uuidv4()}${extension ? `.${extension}` : ""}`;

    const mimeByExt: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
    };
    const filetype = (extension && mimeByExt[extension]) || "application/octet-stream";

    const presigned = await this.getS3UploadUrl(key, filetype);
    if (presigned.isErr()) return err(presigned.error);

    const fileResult = await this.throwablePromise(() => readFile(localPath));
    if (fileResult.isErr()) return err(fileResult.error);

    const resResult = await this.throwablePromise(() =>
      fetch(presigned.value, {
        method: "PUT",
        body: fileResult.value,
        headers: { "Content-Type": filetype },
      })
    );
    if (resResult.isErr()) return err(resResult.error);

    if (!resResult.value.ok) {
      return this.error(
        "INTERNAL_SERVER_ERROR",
        `Failed to upload to S3: ${resResult.value.status}`
      );
    }

    if (returnDownloadUrl) {
      const downloadUrl = await this.getS3DownloadUrl(key);
      if (downloadUrl.isErr()) return err(downloadUrl.error);
      return ok(downloadUrl.value);
    }

    return ok(key);
  }

  async downloadS3ToFile(s3Path: string): ServerResultAsync<string> {
    const extension = s3Path.split(".").pop();
    const destinationPath = path.join(
      tmpdir(),
      "s3-downloads",
      `${uuidv4()}${extension ? `.${extension}` : ""}`
    );

    const result = await this.repository.fileS3.getS3Object(s3Path);
    if (result.isErr()) return err(result.error);

    const body = result.value.Body;
    if (!body) return this.error("NOT_FOUND", "S3 object body is empty");

    const mkdirResult = await this.throwablePromise(() =>
      mkdir(dirname(destinationPath), { recursive: true })
    );
    if (mkdirResult.isErr()) return err(mkdirResult.error);

    if (
      typeof body === "object" &&
      "transformToByteArray" in body &&
      typeof body.transformToByteArray === "function"
    ) {
      const bytesResult = await this.throwablePromise(() => body.transformToByteArray());
      if (bytesResult.isErr()) return err(bytesResult.error);

      const writeResult = await this.throwablePromise(() =>
        writeFile(destinationPath, Buffer.from(bytesResult.value))
      );
      if (writeResult.isErr()) return err(writeResult.error);

      return ok(destinationPath);
    }

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
      const pipelineResult = await this.throwablePromise(() => pipeline(input, writeStream));
      if (pipelineResult.isErr()) {
        writeStream.destroy();
        return err(pipelineResult.error);
      }
      return ok(destinationPath);
    }

    if (
      typeof unknownBody === "object" &&
      unknownBody !== null &&
      "arrayBuffer" in unknownBody &&
      typeof (unknownBody as { arrayBuffer?: unknown }).arrayBuffer === "function"
    ) {
      const bufferResult = await this.throwablePromise(async () =>
        Buffer.from(
          await (unknownBody as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer()
        )
      );
      if (bufferResult.isErr()) {
        writeStream.destroy();
        return err(bufferResult.error);
      }

      const pipelineResult = await this.throwablePromise(() =>
        pipeline(Readable.from(bufferResult.value), writeStream)
      );
      if (pipelineResult.isErr()) {
        writeStream.destroy();
        return err(pipelineResult.error);
      }

      return ok(destinationPath);
    }

    writeStream.destroy();
    return this.error("INTERNAL_SERVER_ERROR", "Unsupported S3 body type");
  }

  getFileType(
    pathValue: string
  ): { fileType: keyof typeof fileTypes; extension: string } | undefined {
    const extension = pathValue.split(".").pop();
    if (!extension) return undefined;

    for (const [key, value] of Object.entries(fileTypes)) {
      if (value.extensions.includes(extension)) {
        return { fileType: key, extension };
      }
    }
    return undefined;
  }
}
