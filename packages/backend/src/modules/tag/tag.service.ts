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
import type { User } from "../auth/auth.lib";
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

  async create(data: TagCreateSchema, { user }: { user: User }): Promise<TagSelectOutputResult> {
    return this.repository.tag.create({ ...data, userId: user.id });
  }

  async update(data: TagUpdateSchema, { user }: { user: User }): Promise<TagSelectOutputResult> {
    return this.repository.tag.update({ ...data, userId: user.id });
  }

  async link(data: TagLinkSchema, { user }: { user: User }): Promise<TaggingSelectOutputResult> {
    return this.repository.tag.link({ ...data, userId: user.id });
  }

  async linkBulk(data: TagLinkSchema[]): ServerResultAsync<TagSchema[]> {
    return this.repository.tag.linkBulk(data);
  }

  async set(data: TagLinkSchema[]): ServerResultAsync<TagSchema[]> {
    return this.repository.tag.set(data);
  }

  async unlink(data: TagLinkSchema, { user }: { user: User }): Promise<TagSelectOutputResult> {
    return this.repository.tag.unlink({ ...data, userId: user.id });
  }

  async delete(data: TagDeleteSchema): ServerResultAsync<{ id: string }> {
    return this.repository.tag.softDeleteById(data.id);
  }
}
