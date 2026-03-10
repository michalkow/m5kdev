import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ok } from "neverthrow";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseExternaRepository } from "#modules/base/base.repository";

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
    return this.throwableAsync(async () => {
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: filename,
        ContentType: filetype,
      });
      const url = await getSignedUrl(this.s3, command, { expiresIn });
      return ok(url);
    });
  }

  async getS3DownloadUrl(path: string, expiresIn = 60 * 5): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: path,
      });
      const url = await getSignedUrl(this.s3, command, { expiresIn });
      return ok(url);
    });
  }

  async getS3Object(path: string): ServerResultAsync<GetObjectCommandOutput> {
    return this.throwableAsync(async () => {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: path,
      });
      const data = await this.s3.send(command);
      return ok(data);
    });
  }

  async getS3ObjectT(path: string): ServerResultAsync<GetObjectCommandOutput> {
    return this.throwableAsync(async () => {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: path,
      });
      const data = await this.s3.send(command);
      return ok(data);
    });
  }

  async deleteS3Object(path: string): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: path,
      });
      await this.s3.send(command);
      return ok(undefined);
    });
  }
}
