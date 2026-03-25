import type {
  TagCreateSchema,
  TagDeleteSchema,
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
  async list(input: TagListInputSchema & TagListSchema): ServerResultAsync<TagListOutputSchema> {
    return this.repository.tag.list(input);
  }

  async listTaggings(input: { resourceType: string; resourceIds?: readonly string[] }) {
    return this.repository.tag.listTaggings(input);
  }

  readonly create = this.procedure<TagCreateSchema>("create")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.create({ ...input, userId: ctx.user.id });
    });

  readonly update = this.procedure<TagUpdateSchema>("update")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.update({ ...input, userId: ctx.user.id });
    });

  readonly link = this.procedure<TagLinkSchema>("link")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TaggingSelectOutputResult> => {
      return this.repository.tag.link({ ...input, userId: ctx.user.id });
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
      return this.repository.tag.unlink({ ...input, userId: ctx.user.id });
    });

  async delete(data: TagDeleteSchema): ServerResultAsync<{ id: string }> {
    return this.repository.tag.softDeleteById(data.id);
  }
}
