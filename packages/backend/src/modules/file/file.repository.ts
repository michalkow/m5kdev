import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseExternaRepository } from "../base/base.repository";

export class FileRepository extends BaseExternaRepository {
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
  async getS3UploadUrl(
    filename: string,
    filetype: string,
    expiresIn = 60 * 5
  ): ServerResultAsync<string> {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: filename,
      ContentType: filetype,
    });
    const urlResult = await this.throwablePromise(() => getSignedUrl(this.s3, command, { expiresIn }));
    if (urlResult.isErr()) return urlResult;
    return ok(urlResult.value);
  }

  async getS3DownloadUrl(path: string, expiresIn = 60 * 5): ServerResultAsync<string> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: path,
    });
    const urlResult = await this.throwablePromise(() => getSignedUrl(this.s3, command, { expiresIn }));
    if (urlResult.isErr()) return urlResult;
    return ok(urlResult.value);
  }

  async getS3Object(path: string): ServerResultAsync<GetObjectCommandOutput> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: path,
    });
    const dataResult = await this.throwablePromise(() => this.s3.send(command));
    if (dataResult.isErr()) return dataResult;
    return ok(dataResult.value);
  }

  async deleteS3Object(path: string): ServerResultAsync<void> {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: path,
    });
    const result = await this.throwablePromise(() => this.s3.send(command));
    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }
}
