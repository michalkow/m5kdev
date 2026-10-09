import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseExternaRepository } from "../base/base.repository";
import { type FileObjectBody, type FileObjectStore, fileS3MockObjectUrl } from "./file.object-store";

export interface LocalFileObjectStoreOptions {
  readonly root: string;
  readonly publicBaseUrl: string;
  readonly defaultBucket: string;
}

interface ObjectMeta {
  readonly contentType: string;
  readonly etag?: string;
}

export class LocalFileObjectStore extends BaseExternaRepository implements FileObjectStore {
  constructor(private readonly options: LocalFileObjectStoreOptions) {
    super();
  }

  getBucket(): string {
    return this.options.defaultBucket;
  }

  getS3UploadUrl(
    key: string,
    _contentType: string,
    _expiresIn?: number,
    bucket?: string
  ): ServerResultAsync<string> {
    return Promise.resolve(
      ok(fileS3MockObjectUrl(this.options.publicBaseUrl, this.resolveBucket(bucket), key))
    );
  }

  getS3DownloadUrl(key: string, _expiresIn?: number, bucket?: string): ServerResultAsync<string> {
    return Promise.resolve(
      ok(fileS3MockObjectUrl(this.options.publicBaseUrl, this.resolveBucket(bucket), key))
    );
  }

  async putS3Object(
    key: string,
    body: Buffer,
    contentType: string,
    bucket?: string
  ): ServerResultAsync<void> {
    const objectPath = this.objectPath(this.resolveBucket(bucket), key);
    const mkdirResult = await this.throwablePromise(() =>
      mkdir(path.dirname(objectPath), { recursive: true })
    );
    if (mkdirResult.isErr()) return err(mkdirResult.error);
    const writeResult = await this.throwablePromise(() => writeFile(objectPath, body));
    if (writeResult.isErr()) return err(writeResult.error);
    const metaResult = await this.throwablePromise(() =>
      writeFile(this.metaPath(objectPath), JSON.stringify({ contentType } satisfies ObjectMeta))
    );
    if (metaResult.isErr()) return err(metaResult.error);
    return ok(undefined);
  }

  async getS3Object(key: string, bucket?: string): ServerResultAsync<FileObjectBody> {
    const objectPath = this.objectPath(this.resolveBucket(bucket), key);
    const bodyResult = await this.throwablePromise(() => readFile(objectPath));
    if (bodyResult.isErr()) {
      return this.error("NOT_FOUND", "Object not found");
    }
    const meta = await this.readMeta(objectPath);
    return ok({
      body: bodyResult.value,
      contentType: meta?.contentType,
      etag: meta?.etag,
    });
  }

  async deleteS3Object(key: string, bucket?: string): ServerResultAsync<void> {
    const objectPath = this.objectPath(this.resolveBucket(bucket), key);
    await this.throwablePromise(() => rm(objectPath, { force: true }));
    await this.throwablePromise(() => rm(this.metaPath(objectPath), { force: true }));
    return ok(undefined);
  }

  async headS3Object(key: string, bucket?: string): ServerResultAsync<boolean> {
    const objectPath = this.objectPath(this.resolveBucket(bucket), key);
    const result = await this.throwablePromise(() => stat(objectPath));
    if (result.isErr()) return ok(false);
    return ok(result.value.isFile());
  }

  private resolveBucket(bucket?: string): string {
    return bucket ?? this.options.defaultBucket;
  }

  private objectPath(bucket: string, key: string): string {
    const safeKey = key
      .split("/")
      .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
      .join("/");
    return path.join(this.options.root, bucket, safeKey);
  }

  private metaPath(objectPath: string): string {
    return `${objectPath}.meta.json`;
  }

  private async readMeta(objectPath: string): Promise<ObjectMeta | undefined> {
    const result = await this.throwablePromise(() => readFile(this.metaPath(objectPath), "utf8"));
    if (result.isErr()) return undefined;
    try {
      return JSON.parse(result.value) as ObjectMeta;
    } catch {
      return undefined;
    }
  }
}
