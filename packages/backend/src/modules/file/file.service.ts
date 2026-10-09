import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname } from "node:path";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { Base } from "../base/base.abstract";
import {
  type AuthenticatedActor,
  createServiceActor,
  hasServiceActorScope,
  type MembershipLookup,
  resolveOrganizationActor,
} from "../base/base.actor";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import type { ResourceGrant } from "../base/base.grants";
import { BasePermissionService } from "../base/base.service";
import { FILE_DOWNLOAD_EXPIRES_IN, FILE_PENDING_TTL_MS } from "./file.constants";
import { fileSchemas } from "./file.dto";
import type { FileObjectBody, FileObjectStore } from "./file.object-store";
import type { FileRepository, FileRow } from "./file.repository";
import {
  type FileLocator,
  type FileTypeAllowlist,
  type PutFileObjectInput,
  toFileLocator,
} from "./file.types";
import { buildS3ObjectKey, extractOriginalExtension } from "./file.utils";

export interface FileServiceConfig {
  readonly buckets?: readonly string[];
  readonly deleteAfterDays?: number;
  readonly purgeObjectOnDelete?: boolean;
  readonly fileTypes?: Record<string, FileTypeAllowlist>;
}

export type FileServiceRepositories = {
  fileS3: FileObjectStore & Base;
  file: FileRepository;
};

export class FileService extends BasePermissionService<
  FileServiceRepositories,
  Record<string, never>
> {
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
    .requireAuth()
    .handle(async ({ input, ctx }) => {
      const uploadedFilter = {
        columnId: "status",
        type: "string" as const,
        method: "equals" as const,
        value: "UPLOADED",
      };
      const scopeFilters = hasServiceActorScope(ctx.actor, "organization")
        ? [
            {
              columnId: "organizationId",
              type: "string" as const,
              method: "equals" as const,
              value: ctx.actor.organizationId ?? "",
            },
          ]
        : [
            {
              columnId: "userId",
              type: "string" as const,
              method: "equals" as const,
              value: ctx.actor.userId,
            },
            {
              columnId: "organizationId",
              type: "string" as const,
              method: "is_null" as const,
              value: "",
            },
          ];
      const listed = await this.repository.file.queryList({
        ...input,
        filters: [...(input.filters ?? []), uploadedFilter, ...scopeFilters],
      });
      if (listed.isErr()) return listed;
      const filtered = this.filterPermission(ctx.actor, "read", listed.value);
      if (this.memberMustOwnFiles(ctx.actor, "read")) {
        const rows = filtered.rows.filter((row) => row.memberId === ctx.actor.memberId);
        return ok({ rows, total: rows.length });
      }
      return ok(filtered);
    });

  readonly get = this.procedure("get")
    .input(fileSchemas.input.get)
    .output(fileSchemas.output.single)
    .requireAuth()
    .loadResource("file", ({ input }) => this.findUploadedFile(input))
    .access({
      action: "read",
      entityStep: "file",
    })
    .handle(({ ctx, state }) => {
      const denied = this.denyFileAccess(ctx.actor, state.file, "read");
      if (denied) return denied;
      return ok(state.file);
    });

  readonly getDownloadUrl = this.procedure("getDownloadUrl")
    .input(fileSchemas.input.getDownloadUrl)
    .output(fileSchemas.output.downloadUrl)
    .requireAuth()
    .loadResource("file", ({ input }) => this.findUploadedFile(input))
    .access({
      action: "read",
      entityStep: "file",
    })
    .handle(async ({ ctx, state }) => {
      const denied = this.denyFileAccess(ctx.actor, state.file, "read");
      if (denied) return denied;
      return this.presignDownload(state.file);
    });

  readonly update = this.procedure("update")
    .input(fileSchemas.input.update)
    .output(fileSchemas.output.single)
    .requireAuth()
    .loadResource("file", ({ input }) => {
      const locator = toFileLocator(input);
      if (!locator) {
        return this.error("BAD_REQUEST", "Provide fileId or bucket and key, not both");
      }
      return this.findUploadedFile(locator);
    })
    .access({
      action: "write",
      entityStep: "file",
    })
    .handle(async ({ input, ctx, state }) => {
      const denied = this.denyFileAccess(ctx.actor, state.file, "write");
      if (denied) return denied;
      return this.repository.file.updateOriginalNameAndMetadata(state.file.id, {
        originalName: input.originalName,
        originalExtension:
          input.originalName !== undefined
            ? (extractOriginalExtension(input.originalName) ?? null)
            : undefined,
        metadata: input.metadata,
      });
    });

  readonly delete = this.procedure("delete")
    .input(fileSchemas.input.delete)
    .output(fileSchemas.output.uuid)
    .requireAuth()
    .loadResource("file", ({ input }) => this.findActiveFile(input))
    .access({
      action: "delete",
      entityStep: "file",
    })
    .handle(async ({ ctx, state }) => {
      const denied = this.denyFileAccess(ctx.actor, state.file, "delete");
      if (denied) return denied;
      const row = state.file;
      if (this.fileConfig.purgeObjectOnDelete !== false) {
        const s3Result = await this.repository.fileS3.deleteS3Object(row.key, row.bucket);
        if (s3Result.isErr()) return err(s3Result.error);
      }
      const soft = await this.repository.file.softDeleteUploadById(row.id);
      if (soft.isErr()) return err(soft.error);
      return ok({ id: row.id });
    });

  /**
   * Daily sweep: stale PENDING → FAILED + object gone; aged DELETED objects gone.
   * No Server event — the User did not wait on this work.
   */
  async purgeExpired(now = new Date()): ServerResultAsync<void> {
    const pendingCutoff = new Date(now.getTime() - FILE_PENDING_TTL_MS);
    const pending = await this.repository.file.listPendingCreatedBefore(pendingCutoff);
    if (pending.isErr()) return err(pending.error);
    for (const row of pending.value) {
      const removed = await this.repository.fileS3.deleteS3Object(row.key, row.bucket);
      if (removed.isErr()) return err(removed.error);
      const failed = await this.repository.file.markFailedById(row.id);
      if (failed.isErr()) return err(failed.error);
    }

    const deleteAfterDays = this.fileConfig.deleteAfterDays ?? 30;
    if (deleteAfterDays < 1) {
      return this.error("INTERNAL_SERVER_ERROR", "deleteAfterDays must be at least 1");
    }
    const deletedCutoff = new Date(now.getTime() - deleteAfterDays * FILE_PENDING_TTL_MS);
    const deleted = await this.repository.file.listDeletedBefore(deletedCutoff);
    if (deleted.isErr()) return err(deleted.error);
    for (const row of deleted.value) {
      const removed = await this.repository.fileS3.deleteS3Object(row.key, row.bucket);
      if (removed.isErr()) return err(removed.error);
    }
    return ok(undefined);
  }

  /**
   * Cookie download: load the File, build Actor from the File (Membership in that
   * organizationId, not the session active Organization), then Grant `read` and presign.
   */
  async downloadById(
    fileId: string,
    input: {
      readonly userId: string;
      readonly userRole: string;
      readonly memberships?: MembershipLookup;
    }
  ): ServerResultAsync<{ url: string; expiresAt: Date }> {
    const rowResult = await this.findUploadedFile({ fileId });
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;

    let actor: AuthenticatedActor;
    if (row.organizationId) {
      const resolved = await resolveOrganizationActor({
        user: { userId: input.userId, userRole: input.userRole },
        organizationId: row.organizationId,
        memberships: input.memberships,
      });
      if (resolved.isErr()) return err(resolved.error);
      actor = resolved.value;
    } else {
      actor = createServiceActor({ userId: input.userId, userRole: input.userRole });
    }

    return this.getDownloadUrl({ fileId }, { actor, user: { id: input.userId } });
  }

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

  getS3Object(key: string): ServerResultAsync<FileObjectBody> {
    return this.repository.fileS3.getS3Object(key);
  }

  /**
   * In-process write for other Services. Not a Procedure — do not call from routers or tRPC.
   */
  async putObject(input: PutFileObjectInput): ServerResultAsync<FileRow> {
    const hasUser = Boolean(input.userId);
    const hasOrg = Boolean(input.memberId && input.organizationId);
    if (!hasUser && !hasOrg) {
      return this.error("BAD_REQUEST", "putObject requires userId or memberId plus organizationId");
    }
    if (Boolean(input.memberId) !== Boolean(input.organizationId)) {
      return this.error("BAD_REQUEST", "memberId and organizationId must be provided together");
    }

    const contentTypeAllowed = this.contentTypeAllowed(input.contentType);
    if (!contentTypeAllowed) {
      return this.error("BAD_REQUEST", "File type is not allowed");
    }

    const bucketResult = this.resolveBucket(input.bucket);
    if (bucketResult.isErr()) return err(bucketResult.error);
    const bucket = bucketResult.value;

    const ownerUserId = input.userId ?? input.memberId;
    if (!ownerUserId) {
      return this.error("BAD_REQUEST", "putObject requires userId or memberId plus organizationId");
    }

    const originalExtension = extractOriginalExtension(input.originalName);
    const key = buildS3ObjectKey({
      userId: ownerUserId,
      organizationId: input.organizationId,
      extension: originalExtension,
      pathHint: input.pathHint,
    });

    const put = await this.repository.fileS3.putS3Object(
      key,
      input.body,
      input.contentType,
      bucket
    );
    if (put.isErr()) return err(put.error);

    return this.repository.file.create({
      bucket,
      key,
      originalName: input.originalName,
      originalExtension,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes ?? input.body.byteLength,
      metadata: input.metadata,
      status: "UPLOADED",
      userId: input.userId ?? null,
      memberId: input.memberId ?? null,
      organizationId: input.organizationId ?? null,
      uploadedAt: new Date(),
    });
  }

  /**
   * In-process read for other Services. Not a Procedure — do not call from routers or tRPC.
   */
  async getObject(locator: FileLocator): ServerResultAsync<FileObjectBody & { fileId: string }> {
    const rowResult = await this.findUploadedFile(locator);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;

    const object = await this.repository.fileS3.getS3Object(row.key, row.bucket);
    if (object.isErr()) return err(object.error);
    return ok({ ...object.value, fileId: row.id });
  }

  readonly initiate = this.procedure("initiate")
    .input(fileSchemas.input.initiate)
    .output(fileSchemas.output.initiate)
    .requireAuth()
    .access({
      action: "write",
      entities: ({ ctx }) =>
        hasServiceActorScope(ctx.actor, "organization")
          ? {
              userId: ctx.actor.userId,
              memberId: ctx.actor.memberId,
              organizationId: ctx.actor.organizationId,
            }
          : {
              userId: ctx.actor.userId,
              memberId: null,
              organizationId: null,
            },
    })
    .handle(async ({ input, ctx }) => {
      const contentTypeAllowed = this.contentTypeAllowed(input.contentType);
      if (!contentTypeAllowed) {
        return this.error("BAD_REQUEST", "File type is not allowed");
      }

      const bucketResult = this.resolveBucket(input.bucket);
      if (bucketResult.isErr()) return err(bucketResult.error);
      const bucket = bucketResult.value;

      const isOrg = hasServiceActorScope(ctx.actor, "organization");
      const organizationId = isOrg ? ctx.actor.organizationId : null;
      const memberId = isOrg ? ctx.actor.memberId : null;

      const originalExtension = extractOriginalExtension(input.originalName);
      const key = buildS3ObjectKey({
        userId: ctx.actor.userId,
        organizationId: organizationId ?? undefined,
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
        userId: ctx.actor.userId,
        memberId,
        organizationId,
      });
      if (createdResult.isErr()) return err(createdResult.error);

      const row = createdResult.value;
      const urlResult = await this.repository.fileS3.getS3UploadUrl(
        key,
        input.contentType,
        undefined,
        bucket
      );
      if (urlResult.isErr()) {
        const failed = await this.repository.file.markFailedById(row.id);
        if (failed.isErr()) return err(failed.error);
        return err(urlResult.error);
      }

      return ok({
        fileId: row.id,
        bucket,
        key,
        url: urlResult.value,
      });
    });

  private resolveBucket(requested?: string): ServerResult<string> {
    const allowlist =
      this.fileConfig.buckets && this.fileConfig.buckets.length > 0
        ? this.fileConfig.buckets
        : [this.repository.fileS3.getBucket()].filter(
            (value): value is string => typeof value === "string" && value.length > 0
          );
    if (requested) {
      if (!allowlist.includes(requested)) {
        return this.error("BAD_REQUEST", "Bucket is not allowlisted");
      }
      return ok(requested);
    }
    const fallback = allowlist[0];
    if (!fallback) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    return ok(fallback);
  }

  readonly finalize = this.procedure("finalize")
    .input(fileSchemas.input.finalize)
    .output(fileSchemas.output.finalize)
    .requireAuth()
    .loadResource("file", ({ input }) => {
      const locator = toFileLocator(input);
      if (!locator) {
        return this.error("BAD_REQUEST", "Provide fileId or bucket and key, not both");
      }
      return this.findActiveFile(locator);
    })
    .access({
      action: "write",
      entityStep: "file",
    })
    .handle(async ({ input, ctx, state }) => {
      const denied = this.denyFileAccess(ctx.actor, state.file, "write");
      if (denied) return denied;
      const row = state.file;

      if (row.status === "UPLOADED") {
        return ok(undefined);
      }

      if (row.status !== "PENDING") {
        return this.error("BAD_REQUEST", "File cannot be finalized in its current state");
      }

      const head = await this.repository.fileS3.headS3Object(row.key, row.bucket);
      if (head.isErr()) return err(head.error);
      if (!head.value) {
        const failed = await this.repository.file.markFailedById(row.id);
        if (failed.isErr()) return err(failed.error);
        return this.error("BAD_REQUEST", "Uploaded object was not found");
      }

      const updated = await this.repository.file.updateStatusById(row.id, {
        status: "UPLOADED",
        etag: input.etag ?? null,
        uploadedAt: new Date(),
      });
      if (updated.isErr()) return err(updated.error);
      return ok(undefined);
    });

  private allowedFileTypes(): Record<string, FileTypeAllowlist> {
    return this.fileConfig.fileTypes ?? fileTypes;
  }

  private contentTypeAllowed(contentType: string): boolean {
    return Object.values(this.allowedFileTypes()).some((kind) =>
      kind.mimetypes.includes(contentType)
    );
  }

  private denyFileAccess(
    actor: AuthenticatedActor,
    file: { organizationId: string | null; memberId: string | null },
    action: string
  ): ServerResult<never> | null {
    if (!this.actorMatchesFileScope(actor, file)) {
      return this.error("FORBIDDEN", "Actor scope does not match this File");
    }
    if (this.memberCannotAccessOthersFile(actor, file, action)) {
      return this.error("FORBIDDEN", `You can only ${action} your own File`);
    }
    return null;
  }

  private actorMatchesFileScope(
    actor: AuthenticatedActor,
    file: { organizationId: string | null }
  ): boolean {
    if (actor.userRole === "admin") {
      return true;
    }
    if (file.organizationId) {
      return (
        hasServiceActorScope(actor, "organization") && actor.organizationId === file.organizationId
      );
    }
    return !hasServiceActorScope(actor, "organization");
  }

  private memberMustOwnFiles(actor: AuthenticatedActor, action: string): boolean {
    if (!hasServiceActorScope(actor, "organization") || actor.organizationRole !== "member") {
      return false;
    }
    const grant = this.grants.find(
      (item) =>
        item.action === action &&
        item.level === "organization" &&
        item.role === actor.organizationRole
    );
    return grant?.access !== "org" && grant?.access !== "all";
  }

  private memberCannotAccessOthersFile(
    actor: AuthenticatedActor,
    file: { memberId: string | null },
    action: string
  ): boolean {
    return this.memberMustOwnFiles(actor, action) && file.memberId !== actor.memberId;
  }

  private async presignDownload(row: FileRow): ServerResultAsync<{ url: string; expiresAt: Date }> {
    const url = await this.repository.fileS3.getS3DownloadUrl(
      row.key,
      FILE_DOWNLOAD_EXPIRES_IN,
      row.bucket
    );
    if (url.isErr()) return err(url.error);
    return ok({
      url: url.value,
      expiresAt: new Date(Date.now() + FILE_DOWNLOAD_EXPIRES_IN * 1000),
    });
  }

  private async findActiveFile(locator: FileLocator): ServerResultAsync<FileRow> {
    const rowResult =
      "fileId" in locator
        ? await this.repository.file.findActiveById(locator.fileId)
        : await this.repository.file.findActiveByBucketAndKey(locator.bucket, locator.key);
    if (rowResult.isErr()) return err(rowResult.error);
    const row = rowResult.value;
    if (!row) {
      return this.error("NOT_FOUND", "File not found");
    }
    return ok(row);
  }

  private async findUploadedFile(locator: FileLocator): ServerResultAsync<FileRow> {
    const rowResult = await this.findActiveFile(locator);
    if (rowResult.isErr()) return err(rowResult.error);
    if (rowResult.value.status !== "UPLOADED") {
      return this.error("NOT_FOUND", "File not found");
    }
    return ok(rowResult.value);
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

  getFileType(pathValue: string): { fileType: string; extension: string } | undefined {
    const extension = pathValue.split(".").pop();
    if (!extension) return undefined;

    for (const [key, value] of Object.entries(this.allowedFileTypes())) {
      if (value.extensions?.includes(extension)) {
        return { fileType: key, extension };
      }
    }
    return undefined;
  }
}
