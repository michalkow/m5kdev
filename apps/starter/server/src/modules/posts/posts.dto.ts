import { createZodSchemas } from "@m5kdev/backend/modules/base/base.dto";
import { z } from "zod";
import { posts } from "./posts.db";

const { output, input } = createZodSchemas(posts);

export const postSchemas = {
  output,
  input: {
    ...input,
    create: z.object({
      title: z.string(),
      slug: z.string().optional(),
      excerpt: z.string().optional(),
      content: z.string(),
    }),
    update: z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string().optional(),
      excerpt: z.string().optional(),
      content: z.string(),
    }),
    publish: z.object({
      id: z.string(),
    }),
  },
};
