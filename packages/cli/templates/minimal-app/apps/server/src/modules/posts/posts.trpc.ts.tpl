import {
  postCreateInputSchema,
  postCreateOutputSchema,
  postPublishInputSchema,
  postPublishOutputSchema,
  postSoftDeleteInputSchema,
  postSoftDeleteOutputSchema,
  postsListInputSchema,
  postsListOutputSchema,
  postUpdateInputSchema,
  postUpdateOutputSchema,
} from "{{PACKAGE_SCOPE}}/shared/modules/posts/posts.schema";
import { handleTRPCResult, type TRPCMethods } from "@m5kdev/backend/utils/trpc";
import type { PostsService } from "./posts.service";

export function createPostsTRPC(
  { router, privateProcedure: procedure }: TRPCMethods,
  postsService: PostsService
) {
  return router({
    list: procedure
      .input(postsListInputSchema)
      .output(postsListOutputSchema)
      .query(async ({ ctx, input }) => handleTRPCResult(await postsService.list(input ?? {}, ctx))),

    create: procedure
      .input(postCreateInputSchema)
      .output(postCreateOutputSchema)
      .mutation(async ({ ctx, input }) => handleTRPCResult(await postsService.create(input, ctx))),

    update: procedure
      .input(postUpdateInputSchema)
      .output(postUpdateOutputSchema)
      .mutation(async ({ ctx, input }) => handleTRPCResult(await postsService.update(input, ctx))),

    publish: procedure
      .input(postPublishInputSchema)
      .output(postPublishOutputSchema)
      .mutation(async ({ ctx, input }) => handleTRPCResult(await postsService.publish(input, ctx))),

    softDelete: procedure
      .input(postSoftDeleteInputSchema)
      .output(postSoftDeleteOutputSchema)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await postsService.softDelete(input, ctx))
      ),
  });
}
