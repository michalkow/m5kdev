import { z } from "zod";
import { createZodSchemas } from "../base/base.dto";
import { files } from "./file.db";

const { insertSchema, updateSchema, output, input } = createZodSchemas(files);

export const fileSchemas = {
  output,
  input: {
    ...input,
    create: insertSchema.omit({
      id: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      userId: true,
      memberId: true,
      organizationId: true,
      teamId: true,
    }),
    update: updateSchema
      .omit({
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        userId: true,
        memberId: true,
        organizationId: true,
        teamId: true,
      })
      .extend({ id: z.string() }),
  },
};
