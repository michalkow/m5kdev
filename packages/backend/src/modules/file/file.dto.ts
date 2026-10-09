import { z } from "zod";
import { createZodSchemas } from "../base/base.dto";
import { files } from "./file.db";

const { insertSchema, updateSchema, output, input } = createZodSchemas(files);

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
    update: updateSchema
      .omit({
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        userId: true,
        memberId: true,
        organizationId: true,
      })
      .extend({ id: z.string() }),
  },
};
