import { handleTRPCResult, type TRPCMethods } from "@m5kdev/backend/utils/trpc";
import { postCreateSchema, postSchema } from "m5kdev-auth-e2e-shared/modules/posts/posts.schema";
import type { PostsService } from "./posts.service";

export function createPostsTRPC(
  { router, privateProcedure, organizationProcedure }: TRPCMethods,
  posts: PostsService
) {
  return router({
    list: privateProcedure.output(postSchema.array()).query(async ({ ctx }) => {
      return handleTRPCResult(await posts.list(undefined, ctx));
    }),
    create: organizationProcedure
      .input(postCreateSchema)
      .output(postSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await posts.create(input, ctx));
      }),
  });
}
