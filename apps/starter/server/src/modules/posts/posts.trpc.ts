import { handleTRPCResult, type TRPCMethods } from "@m5kdev/backend/utils/trpc";
import { postSchemas } from "./posts.dto";
import type { PostsService } from "./posts.service";

export function createPostsTRPC(
  { router, privateProcedure: procedure }: TRPCMethods,
  postsService: PostsService
) {
  return router({
    list: procedure
      .input(postSchemas.input.list)
      .output(postSchemas.output.list)
      .query(async ({ ctx, input }) => handleTRPCResult(await postsService.list(input ?? {}, ctx))),

    create: procedure
      .input(postSchemas.input.create)
      .output(postSchemas.output.single)
      .mutation(async ({ ctx, input }) => handleTRPCResult(await postsService.create(input, ctx))),

    update: procedure
      .input(postSchemas.input.update)
      .output(postSchemas.output.single)
      .mutation(async ({ ctx, input }) => handleTRPCResult(await postsService.update(input, ctx))),

    publish: procedure
      .input(postSchemas.input.publish)
      .output(postSchemas.output.single)
      .mutation(async ({ ctx, input }) => handleTRPCResult(await postsService.publish(input, ctx))),

    softDelete: procedure
      .input(postSchemas.input.delete)
      .output(postSchemas.output.uuid)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await postsService.softDelete(input, ctx))
      ),
  });
}
