import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseExternaRepository, BaseTableRepository } from "../base/base.repository";
import { type FileUploadStatus, files } from "./file.db";
import type { FileObjectBody, FileObjectStore } from "./file.object-store";

const schema = { files };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;
export type FileRow = InferSelectModel<typeof files>;

export class FileRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["files"]
> {
  constructor(options: { orm: Orm; schema: Schema }) {
    super({ orm: options.orm, schema: options.schema, table: options.schema.files });
  }

  async findActiveById(id: string, tx?: Orm): ServerResultAsync<FileRow | undefined> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.files)
        .where(and(eq(this.schema.files.id, id), isNull(this.schema.files.deletedAt)))
        .limit(1)
    );
    if (result.isErr()) return err(result.error);
    const [row] = result.value;
    return ok(row);
  }

  async findActiveByBucketAndKey(
    bucket: string,
    key: string,
    tx?: Orm
  ): ServerResultAsync<FileRow | undefined> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.files)
        .where(
          and(
            eq(this.schema.files.bucket, bucket),
            eq(this.schema.files.key, key),
            isNull(this.schema.files.deletedAt)
          )
        )
        .limit(1)
    );
    if (result.isErr()) return err(result.error);
    const [row] = result.value;
    return ok(row);
  }

  async findActiveByIdForUser(
    id: string,
    userId: string,
    tx?: Orm
  ): ServerResultAsync<FileRow | undefined> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.files)
        .where(
          and(
            eq(this.schema.files.id, id),
            eq(this.schema.files.userId, userId),
            isNull(this.schema.files.deletedAt)
          )
        )
        .limit(1)
    );
    if (result.isErr()) return err(result.error);
    const [row] = result.value;
    return ok(row);
  }

  async updateStatusById(
    id: string,
    data: {
      status: FileUploadStatus;
      etag?: string | null;
      uploadedAt?: Date | null;
    },
    tx?: Orm
  ): ServerResultAsync<FileRow> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .update(this.schema.files)
        .set({
          status: data.status,
          etag: data.etag ?? undefined,
          uploadedAt: data.uploadedAt ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(this.schema.files.id, id))
        .returning()
    );
    if (result.isErr()) return err(result.error);
    const [row] = result.value as FileRow[];
    if (!row) return this.error("NOT_FOUND");
    return ok(row);
  }

  async markFailedById(id: string, tx?: Orm): ServerResultAsync<FileRow> {
    return this.updateStatusById(id, { status: "FAILED" }, tx);
  }

  async listPendingCreatedBefore(before: Date, tx?: Orm): ServerResultAsync<FileRow[]> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.files)
        .where(
          and(
            eq(this.schema.files.status, "PENDING"),
            lt(this.schema.files.createdAt, before),
            isNull(this.schema.files.deletedAt)
          )
        )
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async listDeletedBefore(before: Date, tx?: Orm): ServerResultAsync<FileRow[]> {
    const db = tx ?? this.orm;
    const result = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.files)
        .where(
          and(eq(this.schema.files.status, "DELETED"), lt(this.schema.files.deletedAt, before))
        )
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async updateOriginalNameAndMetadata(
    id: string,
    data: {
      originalName?: string;
      originalExtension?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    tx?: Orm
  ): ServerResultAsync<FileRow> {
    const db = tx ?? this.orm;
    const patch: {
      updatedAt: Date;
      originalName?: string;
      originalExtension?: string | null;
      metadata?: Record<string, unknown> | null;
    } = { updatedAt: new Date() };
    if (data.originalName !== undefined) {
      patch.originalName = data.originalName;
      patch.originalExtension = data.originalExtension;
    }
    if (data.metadata !== undefined) {
      patch.metadata = data.metadata;
    }
    const result = await this.throwableQuery(() =>
      db
        .update(this.schema.files)
        .set(patch)
        .where(eq(this.schema.files.id, id))
        .returning()
    );
    if (result.isErr()) return err(result.error);
    const [row] = result.value as FileRow[];
    if (!row) return this.error("NOT_FOUND");
    return ok(row);
  }

  async softDeleteUploadById(id: string, tx?: Orm): ServerResultAsync<{ id: string }> {
    const db = tx ?? this.orm;
    const rowsResult = await this.throwableQuery(() =>
      db
        .update(this.schema.files)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
          status: "DELETED",
        })
        .where(and(eq(this.schema.files.id, id), isNull(this.schema.files.deletedAt)))
        .returning({ id: this.schema.files.id })
    );
    if (rowsResult.isErr()) return err(rowsResult.error);
    const [row] = rowsResult.value;
    if (!row) return this.error("NOT_FOUND");
    return ok(row);
  }
}

export class FileS3Repository extends BaseExternaRepository implements FileObjectStore {
  private s3: S3Client | undefined;

  private resolveBucket(bucket?: string): string | undefined {
    return bucket ?? process.env.AWS_S3_BUCKET;
  }

  private getClient(): ServerResult<S3Client> {
    if (this.s3) return ok(this.s3);
    if (
      !process.env.AWS_REGION ||
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY
    ) {
      return this.error("INTERNAL_SERVER_ERROR", "Missing AWS environment variables");
    }

    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      ...(process.env.AWS_S3_ENDPOINT ? { endpoint: process.env.AWS_S3_ENDPOINT } : {}),
      forcePathStyle: !!process.env.AWS_S3_ENDPOINT, // Path style is often required for non-AWS S3 providers
    });
    return ok(this.s3);
  }

  getBucket(): string | undefined {
    return process.env.AWS_S3_BUCKET;
  }

  async getS3UploadUrl(
    key: string,
    filetype: string,
    expiresIn = 60 * 5,
    bucket?: string
  ): ServerResultAsync<string> {
    const client = this.getClient();
    if (client.isErr()) return err(client.error);
    const resolvedBucket = this.resolveBucket(bucket);
    if (!resolvedBucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    const command = new PutObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
      ContentType: filetype,
    });
    const urlResult = await this.throwablePromise(() =>
      getSignedUrl(client.value, command, { expiresIn })
    );
    if (urlResult.isErr()) return urlResult;
    return ok(urlResult.value);
  }

  async getS3DownloadUrl(
    key: string,
    expiresIn = 60 * 5,
    bucket?: string
  ): ServerResultAsync<string> {
    const client = this.getClient();
    if (client.isErr()) return err(client.error);
    const resolvedBucket = this.resolveBucket(bucket);
    if (!resolvedBucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    const command = new GetObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
    });
    const urlResult = await this.throwablePromise(() =>
      getSignedUrl(client.value, command, { expiresIn })
    );
    if (urlResult.isErr()) return urlResult;
    return ok(urlResult.value);
  }

  async getS3Object(key: string, bucket?: string): ServerResultAsync<FileObjectBody> {
    const client = this.getClient();
    if (client.isErr()) return err(client.error);
    const resolvedBucket = this.resolveBucket(bucket);
    if (!resolvedBucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    const command = new GetObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
    });
    const dataResult = await this.throwablePromise(() => client.value.send(command));
    if (dataResult.isErr()) return err(dataResult.error);
    const body = dataResult.value.Body;
    if (!body || typeof body.transformToByteArray !== "function") {
      return this.error("INTERNAL_SERVER_ERROR", "S3 object body is empty");
    }
    const bytesResult = await this.throwablePromise(() => body.transformToByteArray());
    if (bytesResult.isErr()) return err(bytesResult.error);
    return ok({
      body: Buffer.from(bytesResult.value),
      contentType: dataResult.value.ContentType,
      etag: dataResult.value.ETag,
    });
  }

  async putS3Object(
    key: string,
    body: Buffer,
    contentType: string,
    bucket?: string
  ): ServerResultAsync<void> {
    const client = this.getClient();
    if (client.isErr()) return err(client.error);
    const resolvedBucket = this.resolveBucket(bucket);
    if (!resolvedBucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    const command = new PutObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    const result = await this.throwablePromise(() => client.value.send(command));
    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }

  async deleteS3Object(key: string, bucket?: string): ServerResultAsync<void> {
    const client = this.getClient();
    if (client.isErr()) return err(client.error);
    const resolvedBucket = this.resolveBucket(bucket);
    if (!resolvedBucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    const command = new DeleteObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
    });
    const result = await this.throwablePromise(() => client.value.send(command));
    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }

  async headS3Object(key: string, bucket?: string): ServerResultAsync<boolean> {
    const client = this.getClient();
    if (client.isErr()) return err(client.error);
    const resolvedBucket = this.resolveBucket(bucket);
    if (!resolvedBucket) {
      return this.error("INTERNAL_SERVER_ERROR", "S3 bucket is not configured");
    }
    const command = new HeadObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
    });
    const result = await this.throwablePromise(() => client.value.send(command));
    if (result.isErr()) return ok(false);
    return ok(true);
  }
}
