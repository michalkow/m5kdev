import type {
  TagDeleteSchema,
  TagCreateSchema,
  TagLinkSchema,
  TagListInputSchema,
  TagListOutputSchema,
  TagListSchema,
  TagSchema,
  TagUpdateSchema,
} from "@m5kdev/commons/modules/tag/tag.schema";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type { TaggingSelectOutputResult, TagSelectOutputResult } from "./tag.dto";
import type { TagRepository } from "./tag.repository";

export class TagService extends BaseService<{ tag: TagRepository }, Record<string, never>> {
  readonly list = this.procedure<TagListInputSchema & TagListSchema>("list")
    .requireAuth()
    .handle(({ input, ctx }): ServerResultAsync<TagListOutputSchema> => {
      return this.repository.tag.list({
        ...input,
        filters: [
          ...(input.filters ?? []),
          {
            columnId: "userId",
            type: "string",
            method: "equals",
            value: ctx.actor.userId,
          },
        ],
      });
    });

  readonly listTaggings = this.procedure<{ resourceType: string; resourceIds?: readonly string[] }>(
    "listTaggings"
  )
    .requireAuth()
    .handle(({ input, ctx }) => {
      return this.repository.tag.listTaggingsForUser(input, ctx.actor.userId);
    });

  readonly create = this.procedure<TagCreateSchema>("create")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.create({ ...input, userId: ctx.actor.userId });
    });

  readonly update = this.procedure<TagUpdateSchema>("update")
    .requireAuth()
    .loadResource("tag", ({ input }) => this.repository.tag.findById(input.id))
    .use("owner", ({ ctx, state }) => {
      if (state.tag.userId !== ctx.actor.userId) return this.error("FORBIDDEN");
      return true;
    })
    .handle(({ input }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.update(input);
    });

  readonly link = this.procedure<TagLinkSchema>("link")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TaggingSelectOutputResult> => {
      return this.repository.tag.link({ ...input, userId: ctx.actor.userId });
    });

  async linkBulk(data: TagLinkSchema[]): ServerResultAsync<TagSchema[]> {
    return this.repository.tag.linkBulk(data);
  }

  async set(data: TagLinkSchema[]): ServerResultAsync<TagSchema[]> {
    return this.repository.tag.set(data);
  }

  readonly unlink = this.procedure<TagLinkSchema>("unlink")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.unlink({ ...input, userId: ctx.actor.userId });
    });

  readonly delete = this.procedure<TagDeleteSchema>("delete")
    .requireAuth()
    .loadResource("tag", ({ input }) => this.repository.tag.findById(input.id))
    .use("owner", ({ ctx, state }) => {
      if (state.tag.userId !== ctx.actor.userId) return this.error("FORBIDDEN");
      return true;
    })
    .handle(({ input }) => this.repository.tag.softDeleteById(input.id));
}
