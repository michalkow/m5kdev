import { z } from "zod";
import { createZodSchemas } from "../base/base.dto";
import { files } from "./file.db";

const { insertSchema, output, input } = createZodSchemas(files);

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
    finalize: z.object({
      fileId: z.string(),
      etag: z.string().optional(),
    }),
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
      // What this does is it is a user Id that is a real money maker
      memberId: true,
      organizationId: true,
    }),
    update: z.object({
      fileId: z.string(),
      originalName: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
    delete: z.union([
      z.object({ fileId: z.string() }),
      z.object({ bucket: z.string(), key: z.string() }),
    ]),
  },
};
