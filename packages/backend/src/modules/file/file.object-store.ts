import type { ServerResultAsync } from "../base/base.dto";

export interface FileObjectBody {
  readonly body: Buffer;
  readonly contentType?: string;
  readonly etag?: string;
}

export interface FileObjectStore {
  getBucket(): string | undefined;
  getS3UploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
    bucket?: string
  ): ServerResultAsync<string>;
  getS3DownloadUrl(key: string, expiresIn?: number, bucket?: string): ServerResultAsync<string>;
  getS3Object(key: string, bucket?: string): ServerResultAsync<FileObjectBody>;
  putS3Object(
    key: string,
    body: Buffer,
    contentType: string,
    bucket?: string
  ): ServerResultAsync<void>;
  deleteS3Object(key: string, bucket?: string): ServerResultAsync<void>;
  headS3Object(key: string, bucket?: string): ServerResultAsync<boolean>;
}

export const FILE_S3_MOCK_MOUNT = "/file-s3-mock";

export function fileS3MockObjectUrl(
  publicBaseUrl: string,
  bucket: string,
  key: string
): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}${FILE_S3_MOCK_MOUNT}/${encodeURIComponent(bucket)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
