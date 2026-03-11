import {
  tagCreateSchema,
  tagDeleteSchema,
  taggingSchema,
  tagLinkSchema,
  tagListInputSchema,
  tagListOutputSchema,
  tagListSchema,
  tagUpdateSchema,
} from "@m5kdev/commons/modules/tag/tag.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { taggingsSelectOutput, tagsSelectOutput } from "./tag.dto";
import type { TagService } from "./tag.service";

export function createTagTRPC(
  { router, privateProcedure: procedure }: TRPCMethods,
  tagService: TagService
) {
  const tagListInput = tagListInputSchema.extend({
    assignableTo: tagListSchema.shape.assignableTo,
  });

  return router({
    list: procedure
      .input(tagListInput)
      .output(tagListOutputSchema)
      .query(async ({ input }) => handleTRPCResult(await tagService.list(input))),

    listTaggings: procedure
      .input(
        taggingSchema
          .pick({ resourceType: true })
          .extend({ resourceIds: tagListInputSchema.shape.filters.optional() })
      )
      .output(taggingsSelectOutput.array())
      .query(async ({ input }) => handleTRPCResult(await tagService.listTaggings(input as any))),

    create: procedure
      .input(tagCreateSchema)
      .output(tagsSelectOutput)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await tagService.create(input, ctx));
      }),

    update: procedure
      .input(tagUpdateSchema)
      .output(tagsSelectOutput)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await tagService.update(input, ctx));
      }),

    link: procedure
      .input(tagLinkSchema)
      .output(taggingsSelectOutput)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await tagService.link(input, ctx));
      }),

    unlink: procedure
      .input(tagLinkSchema)
      .output(tagsSelectOutput)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await tagService.unlink(input, ctx));
      }),

    delete: procedure
      .input(tagDeleteSchema)
      .output(tagsSelectOutput.pick({ id: true }))
      .mutation(async ({ input }) => {
        return handleTRPCResult(await tagService.delete(input));
      }),
  });
}
