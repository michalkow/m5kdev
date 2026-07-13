import { createZodSchemas } from "@m5kdev/backend/modules/base/base.dto";
import {
  postCreateInputSchema,
  postUpdateInputSchema,
} from "@starter-app/shared/modules/posts/posts.schema";
import { z } from "zod";
import { posts } from "./posts.db";

const { output, input } = createZodSchemas(posts);

export const postSchemas = {
  output,
  input: {
    ...input,
    // create/update come from shared: the same schemas validate the webapp form,
    // so the API contract and the frontend validation cannot drift apart
    create: postCreateInputSchema,
    update: postUpdateInputSchema,
    publish: z.object({
      id: z.string(),
    }),
  },
};
