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
import { BasePermissionService } from "../base/base.service";
import type { TaggingSelectOutputResult, TagSelectOutputResult } from "./tag.dto";
import type { TagRepository } from "./tag.repository";

export class TagService extends BasePermissionService<
  { tag: TagRepository },
  Record<string, never>
> {
  readonly list = this.procedure<TagListInputSchema & TagListSchema>("list")
    .requireAuth()
    .handle(({ input, ctx }): ServerResultAsync<TagListOutputSchema> => {
      const ownershipFilter = ctx.actor.memberId
        ? {
            columnId: "memberId",
            type: "string" as const,
            method: "equals" as const,
            value: ctx.actor.memberId,
          }
        : {
            columnId: "userId",
            type: "string" as const,
            method: "equals" as const,
            value: ctx.actor.userId,
          };
      return this.repository.tag.list({
        ...input,
        filters: [...(input.filters ?? []), ownershipFilter],
      });
    });

  readonly listTaggings = this.procedure<{ resourceType: string; resourceIds?: readonly string[] }>(
    "listTaggings"
  )
    .requireAuth()
    .handle(({ input, ctx }) => {
      return this.repository.tag.listTaggingsForOwner(input, {
        userId: ctx.actor.userId,
        memberId: ctx.actor.memberId,
      });
    });

  readonly create = this.procedure<TagCreateSchema>("create")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.create({
        ...input,
        userId: ctx.actor.userId,
        memberId: ctx.actor.memberId ?? null,
        organizationId: ctx.actor.organizationId ?? null,
        teamId: ctx.actor.teamId ?? null,
      });
    });

  readonly update = this.procedure<TagUpdateSchema>("update")
    .requireAuth()
    .loadResource("tag", ({ input }) => this.repository.tag.findById(input.id))
    .access({
      action: "write",
      entityStep: "tag",
    })
    .handle(({ input }): Promise<TagSelectOutputResult> => {
      return this.repository.tag.update(input);
    });

  readonly link = this.procedure<TagLinkSchema>("link")
    .requireAuth()
    .handle(({ input, ctx }): Promise<TaggingSelectOutputResult> => {
      return this.repository.tag.link({
        ...input,
        userId: ctx.actor.userId,
        memberId: ctx.actor.memberId,
      });
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
      return this.repository.tag.unlink({
        ...input,
        userId: ctx.actor.userId,
        memberId: ctx.actor.memberId,
      });
    });

  readonly delete = this.procedure<TagDeleteSchema>("delete")
    .requireAuth()
    .loadResource("tag", ({ input }) => this.repository.tag.findById(input.id))
    .access({
      action: "delete",
      entityStep: "tag",
    })
    .handle(({ input }) => this.repository.tag.softDeleteById(input.id));
}
