import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname } from "node:path";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { AuthenticatedActor } from "../base/base.actor";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import type { ResourceGrant } from "../base/base.grants";
import { BasePermissionService } from "../base/base.service";
import { LOCAL_FILE_BUCKET } from "./file.constants";
import { fileSchemas } from "./file.dto";
import type { LocalFileObjectStore } from "./file.local-store";
import type { FileRepository, FileS3Repository } from "./file.repository";
import type {
  FinalizeS3UploadInput,
  InitiateS3UploadInput,
  InitiateS3UploadResult,
  RecordLocalUploadInput,
  RecordLocalUploadResult,
} from "./file.types";
import { buildS3ObjectKey, extractOriginalExtension } from "./file.utils";

export interface FileServiceConfig {
  readonly buckets?: readonly string[];
  readonly deleteAfterDays?: number;
}

export type FileServiceRepositories = {
  fileS3: FileS3Repository | LocalFileObjectStore;
  file: FileRepository;
};

export class FileService extends BasePermissionService<FileServiceRepositories, Record<string, never>> {
  constructor(
    repository: FileServiceRepositories,
    service: Record<string, never>,
    grants: ResourceGrant[] = [],
    readonly fileConfig: FileServiceConfig = {}
  ) {
    super(repository, service, grants);
  }
  readonly list = this.procedure("list")
    .input(fileSchemas.input.list)
    .output(fileSchemas.output.list)
    .requireAuth("organization")
    .addContextFilter(["organization"])
    .handle(async ({ input, ctx }) => {
      const listed = await this.repository.file.queryList(input);
      if (listed.isErr()) return listed;
      return ok(this.filterPermission(ctx.actor, "read", listed.value));
    });

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

    const bucket = this.repository.fileS3.getBucket();
    if (!bucket) {
      return ok(undefined);
    }

    const rowResult = await this.repository.file.findActiveByBucketAndKey(bucket, key);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return ok(undefined);
    }

    const soft = await this.repository.file.softDeleteUploadById(row.id);
    if (soft.isErr()) return err(soft.error);
    return ok(undefined);
  }

  async recordLocalUpload(
    actor: AuthenticatedActor,
    input: RecordLocalUploadInput
  ): ServerResultAsync<RecordLocalUploadResult> {
    const writeGuard = this.accessGuard(actor, "write", {
      userId: actor.userId,
      memberId: actor.memberId ?? null,
      organizationId: actor.organizationId ?? null,
    });
    if (writeGuard.isErr()) return err(writeGuard.error);

    const createdResult = await this.repository.file.create({
      bucket: LOCAL_FILE_BUCKET,
      key: input.filename,
      originalName: input.originalName,
      originalExtension: extractOriginalExtension(input.originalName),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      status: "UPLOADED",
      userId: actor.userId,
      memberId: actor.memberId ?? null,
      organizationId: actor.organizationId ?? null,
      uploadedAt: new Date(),
    });
    if (createdResult.isErr()) return err(createdResult.error);

    return ok({
      fileId: createdResult.value.id,
      originalName: createdResult.value.originalName,
    });
  }

  async initiateS3Upload(
    actor: AuthenticatedActor,
    input: InitiateS3UploadInput
  ): ServerResultAsync<InitiateS3UploadResult> {
    const writeGuard = this.accessGuard(actor, "write", {
      userId: input.userId,
      memberId: input.memberId ?? null,
      organizationId: input.organizationId ?? null,
    });
    if (writeGuard.isErr()) return err(writeGuard.error);

    const bucket = this.repository.fileS3.getBucket();
    if (!bucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }

    const originalExtension = extractOriginalExtension(input.originalName);
    const key = buildS3ObjectKey({
      userId: input.userId,
      organizationId: input.organizationId,
      extension: originalExtension,
      pathHint: input.pathHint,
    });

    const createdResult = await this.repository.file.create({
      bucket,
      key,
      originalName: input.originalName,
      originalExtension,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      metadata: input.metadata,
      status: "PENDING",
      userId: input.userId,
      memberId: input.memberId ?? null,
      organizationId: input.organizationId,
    });
    if (createdResult.isErr()) return err(createdResult.error);

    const row = createdResult.value;
    const urlResult = await this.repository.fileS3.getS3UploadUrl(key, input.contentType, undefined, bucket);
    if (urlResult.isErr()) {
      const failed = await this.repository.file.markFailedById(row.id);
      if (failed.isErr()) return err(failed.error);
      return err(urlResult.error);
    }

    return ok({
      fileId: row.id,
      key,
      url: urlResult.value,
    });
  }

  async finalizeS3Upload(
    actor: AuthenticatedActor,
    input: FinalizeS3UploadInput
  ): ServerResultAsync<void> {
    const rowResult = await this.repository.file.findActiveById(input.fileId);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return this.error("NOT_FOUND", "File not found");
    }

    const writeGuard = this.accessGuard(actor, "write", {
      userId: row.userId,
      memberId: row.memberId,
      organizationId: row.organizationId,
    });
    if (writeGuard.isErr()) return err(writeGuard.error);

    if (row.status === "UPLOADED") {
      return ok(undefined);
    }

    if (row.status !== "PENDING") {
      return this.error("BAD_REQUEST", "File cannot be finalized in its current state");
    }

    const updated = await this.repository.file.updateStatusById(input.fileId, {
      status: "UPLOADED",
      etag: input.etag ?? null,
      uploadedAt: new Date(),
    });
    if (updated.isErr()) return err(updated.error);
    return ok(undefined);
  }

  async deleteUploadedFileById(actor: AuthenticatedActor, fileId: string): ServerResultAsync<void> {
    const rowResult = await this.repository.file.findActiveById(fileId);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return this.error("NOT_FOUND", "File not found");
    }

    const deleteGuard = this.accessGuard(actor, "delete", {
      userId: row.userId,
      memberId: row.memberId,
      organizationId: row.organizationId,
    });
    if (deleteGuard.isErr()) return err(deleteGuard.error);

    const s3Result = await this.repository.fileS3.deleteS3Object(row.key, row.bucket);
    if (s3Result.isErr()) return err(s3Result.error);

    const soft = await this.repository.file.softDeleteUploadById(row.id);
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

    const mkdirResult = await this.throwablePromise(() =>
      mkdir(dirname(destinationPath), { recursive: true })
    );
    if (mkdirResult.isErr()) return err(mkdirResult.error);

    const writeResult = await this.throwablePromise(() =>
      writeFile(destinationPath, result.value.body)
    );
    if (writeResult.isErr()) return err(writeResult.error);
    return ok(destinationPath);
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
