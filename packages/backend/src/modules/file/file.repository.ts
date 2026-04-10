import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseExternaRepository, BaseTableRepository } from "../base/base.repository";
import { files, type FileUploadStatus } from "./file.db";

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

export class FileS3Repository extends BaseExternaRepository {
  private readonly s3: S3Client;
  constructor() {
    super();

    if (
      !process.env.AWS_REGION ||
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY
    ) {
      throw new Error("Missing AWS environment variables");
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
  }

  getBucket(): string | undefined {
    return process.env.AWS_S3_BUCKET;
  }

  async getS3UploadUrl(
    key: string,
    filetype: string,
    expiresIn = 60 * 5
  ): ServerResultAsync<string> {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      ContentType: filetype,
    });
    const urlResult = await this.throwablePromise(() =>
      getSignedUrl(this.s3, command, { expiresIn })
    );
    if (urlResult.isErr()) return urlResult;
    return ok(urlResult.value);
  }

  async getS3DownloadUrl(key: string, expiresIn = 60 * 5): ServerResultAsync<string> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const urlResult = await this.throwablePromise(() =>
      getSignedUrl(this.s3, command, { expiresIn })
    );
    if (urlResult.isErr()) return urlResult;
    return ok(urlResult.value);
  }

  async getS3Object(key: string): ServerResultAsync<GetObjectCommandOutput> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const dataResult = await this.throwablePromise(() => this.s3.send(command));
    if (dataResult.isErr()) return dataResult;
    return ok(dataResult.value);
  }

  async deleteS3Object(key: string): ServerResultAsync<void> {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const result = await this.throwablePromise(() => this.s3.send(command));
    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }
}
