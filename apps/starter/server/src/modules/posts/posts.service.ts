import type { ServerEventBus } from "@m5kdev/backend/base/server-event";
import type { AuthService } from "@m5kdev/backend/modules/auth/auth.service";
import type { ResourceGrant } from "@m5kdev/backend/modules/base/base.grants";
import { BasePermissionService } from "@m5kdev/backend/modules/base/base.service";
import { serializeSpanValue, withSpan } from "@m5kdev/backend/utils/telemetry";
import type { Context } from "@m5kdev/backend/utils/trpc";
import type { ServerEventChange } from "@m5kdev/commons/modules/base/server-event.schema";
import { POST_SERVER_EVENT_RESOURCE } from "@starter-app/shared/modules/posts/posts.constants";
import { err, ok } from "neverthrow";
import { postSchemas } from "./posts.dto";
import type { PostsRepository } from "./posts.repository";
import { createExcerpt, slugify } from "./posts.utils";

export class PostsService extends BasePermissionService<
  { posts: PostsRepository },
  { auth: AuthService },
  Context
> {
  constructor(
    repository: { posts: PostsRepository },
    service: { auth: AuthService },
    grants: ResourceGrant[],
    private readonly serverEvents: ServerEventBus
  ) {
    super(repository, service, grants);
  }

  readonly list = this.procedure("list")
    .input(postSchemas.input.list)
    .output(postSchemas.output.list)
    .requireAuth("organization")
    .addContextFilter(["organization"])
    .handle(async ({ input }) => {
      return withSpan(
        {
          name: "posts.list.query",
          attributes: { input: serializeSpanValue(input) },
        },
        (span) => {
          span.addEvent("span started");
          return this.repository.posts.queryList(input, {
            globalSearchColumns: ["title", "excerpt", "content"],
          });
        }
      );
    });

  readonly create = this.procedure("create")
    .requireAuth("organization")
    .input(postSchemas.input.create)
    .output(postSchemas.output.single)
    .access({
      action: "write",
    })
    .handle(async ({ input, ctx }) => {
      const uniqueSlug = await this.repository.posts.resolveUniqueSlug({
        candidate: slugify(input.slug ?? input.title),
      });
      if (uniqueSlug.isErr()) {
        return err(uniqueSlug.error);
      }

      const created = await this.repository.posts.create({
        authorUserId: ctx.user.id,
        memberId: ctx.actor.memberId ?? null,
        organizationId: ctx.session.activeOrganizationId ?? null,
        teamId: ctx.session.activeTeamId ?? null,
        title: input.title.trim(),
        slug: uniqueSlug.value,
        excerpt: createExcerpt(input.excerpt, input.content),
        content: input.content.trim(),
        status: "draft",
      });
      if (created.isOk()) {
        this.emitPostChanged({
          userId: ctx.user.id,
          organizationId: created.value.organizationId,
          id: created.value.id,
          change: "created",
        });
      }
      return created;
    });

  readonly update = this.procedure("update")
    .requireAuth("organization")
    .input(postSchemas.input.update)
    .output(postSchemas.output.single)
    .loadResource("post", ({ input }) => this.repository.posts.findById(input.id))
    .access({
      action: "write",
      entityStep: "post",
    })
    .handle(async ({ input, ctx, state }) => {
      const content = input.content?.trim() ?? state.post.content;

      const updated = await this.repository.posts.update({
        id: input.id,
        title: input.title ? input.title.trim() : state.post.title,
        excerpt: createExcerpt(input.excerpt, content),
        content: content.trim(),
      });
      if (updated.isOk()) {
        this.emitPostChanged({
          userId: ctx.user.id,
          organizationId: updated.value.organizationId,
          id: updated.value.id,
          change: "updated",
        });
      }
      return updated;
    });

  readonly publish = this.procedure("publish")
    .input(postSchemas.input.publish)
    .output(postSchemas.output.single)
    .requireAuth("organization")
    .loadResource("post", ({ input }) => this.repository.posts.findById(input.id))
    .access({
      action: "publish",
      entityStep: "post",
    })
    .handle(async ({ input, ctx, state }) => {
      const updated = await this.repository.posts.update({
        id: input.id,
        status: "published",
        publishedAt: state.post?.publishedAt ?? new Date(),
      });
      if (updated.isOk()) {
        this.emitPostChanged({
          userId: ctx.user.id,
          organizationId: updated.value.organizationId,
          id: updated.value.id,
          change: "updated",
        });
      }
      return updated;
    });

  readonly softDelete = this.procedure("softDelete")
    .input(postSchemas.input.delete)
    .output(postSchemas.output.uuid)
    .requireAuth("organization")
    .loadResource("post", ({ input }) => this.repository.posts.findById(input.id))
    .access({
      action: "delete",
      entityStep: "post",
    })
    .handle(async ({ input, ctx, state }) => {
      const updated = await this.repository.posts.update({
        id: input.id,
        deletedAt: new Date(),
      });
      if (updated.isErr()) return err(updated.error);
      this.emitPostChanged({
        userId: ctx.user.id,
        organizationId: state.post.organizationId,
        id: updated.value.id,
        change: "deleted",
      });
      return ok({ id: updated.value.id });
    });

  private emitPostChanged(input: {
    userId: string;
    organizationId: string | null;
    id: string;
    change: ServerEventChange;
  }): void {
    void this.resolveRecipientUserIds(input).then((userIds) => {
      this.serverEvents.emit({
        userIds,
        resource: POST_SERVER_EVENT_RESOURCE,
        id: input.id,
        change: input.change,
        organizationId: input.organizationId,
      });
    });
  }

  private async resolveRecipientUserIds(input: {
    userId: string;
    organizationId: string | null;
  }): Promise<string[]> {
    if (!input.organizationId) return [input.userId];
    const members = await this.service.auth.repository.organization.listOrganizationMembers(
      input.organizationId
    );
    if (members.isErr()) return [input.userId];
    return members.value.map((member) => member.userId);
  }
}
