import { handleTRPCResult, type TRPCMethods } from "@m5kdev/backend/utils/trpc";
import { postSchemas } from "./posts.dto";
import type { PostsService } from "./posts.service";

export function createPostsTRPC(
  { router, organizationProcedure: procedure }: TRPCMethods,
  postsService: PostsService
) {
  return router({
    list: procedure
      // m5k:mcp:start
      .meta({
        mcp: {
          name: "list-posts",
          description:
            "List posts in an Organization. Call list-organizations first to learn organizationId values, then pass one as organizationId.",
        },
      })
      // m5k:mcp:end
      .input(postSchemas.input.list)
      .output(postSchemas.output.list)
      .query(async ({ ctx, input }) => handleTRPCResult(await postsService.list(input ?? {}, ctx))),

    create: procedure
      // m5k:mcp:start
      .meta({
        mcp: {
          name: "create-post",
          description:
            "Create a draft post in an Organization. Call list-organizations first to learn organizationId values, then pass one as organizationId.",
        },
      })
      // m5k:mcp:end
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
