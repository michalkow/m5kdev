import { z } from "zod";
import { createZodSchemas } from "../base/base.dto";
import { files } from "./file.db";

const { insertSchema, output, input } = createZodSchemas(files);

const fileLocatorFields = {
  fileId: z.string().optional(),
  bucket: z.string().optional(),
  key: z.string().optional(),
};

function xorFileLocator(
  val: { fileId?: string; bucket?: string; key?: string },
  ctx: z.RefinementCtx
): void {
  const hasId = Boolean(val.fileId);
  const hasBucketKey = Boolean(val.bucket && val.key);
  if (hasId === hasBucketKey) {
    ctx.addIssue({
      code: "custom",
      message: "Provide fileId or bucket and key, not both",
    });
  }
}

export const fileSchemas = {
  output: {
    ...output,
    initiate: z.object({
      fileId: z.string(),
      bucket: z.string(),
      key: z.string(),
      url: z.string(),
    }),
    finalize: z.void(),
    downloadUrl: z.object({
      url: z.string(),
      expiresAt: z.date(),
    }),
  },
  input: {
    ...input,
    initiate: z.object({
      contentType: z.string(),
      originalName: z.string(),
      sizeBytes: z.number().optional(),
      pathHint: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      bucket: z.string().optional(),
    }),
    finalize: z
      .object({
        ...fileLocatorFields,
        etag: z.string().optional(),
      })
      .superRefine(xorFileLocator),
    get: z.union([
      z.object({ fileId: z.string() }),
      z.object({ bucket: z.string(), key: z.string() }),
    ]),
    getDownloadUrl: z.union([
      z.object({ fileId: z.string() }),
      z.object({ bucket: z.string(), key: z.string() }),
    ]),
    create: insertSchema.omit({
      id: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      userId: true,
      memberId: true,
      organizationId: true,
    }),
    update: z
      .object({
        ...fileLocatorFields,
        originalName: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .superRefine(xorFileLocator),
    delete: z.union([
      z.object({ fileId: z.string() }),
      z.object({ bucket: z.string(), key: z.string() }),
    ]),
  },
};
