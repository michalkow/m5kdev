import { BasePermissionService } from "@m5kdev/backend/modules/base/base.service";
import { serializeSpanValue, withSpan } from "@m5kdev/backend/utils/telemetry";
import type { Context } from "@m5kdev/backend/utils/trpc";
import { err, ok } from "neverthrow";
import { postSchemas } from "./posts.dto";
import type { PostsRepository } from "./posts.repository";
import { createExcerpt, slugify } from "./posts.utils";

export class PostsService extends BasePermissionService<
  { posts: PostsRepository },
  Record<string, never>,
  Context
> {
  readonly list = this.procedure("list")
    .input(postSchemas.input.list)
    .output(postSchemas.output.list)
    .requireAuth("organization")
    .addContextFilter(["organization"])
    .handle(async ({ input, ctx }) => {
      return withSpan(
        {
          name: "posts.list.query",
          attributes: { input: serializeSpanValue(input) },
        },
        async (span) => {
          span.addEvent("span started");
          const listed = await this.repository.posts.queryList(input, {
            globalSearchColumns: ["title", "excerpt", "content"],
          });
          if (listed.isErr()) return listed;
          // Soft-filter so organization members with `"own"` only see their posts;
          // owners/admins with `"org"` keep the full org page.
          return ok(this.filterPermission(ctx.actor, "read", listed.value));
        }
      );
    });

  readonly create = this.procedure("create")
    .requireAuth("organization")
    .input(postSchemas.input.create)
    .output(postSchemas.output.single)
    .access({
      action: "write",
      // Create has no persisted row yet — authorize against the actor's own
      // org/member identity. Without entities, `"org"`/`"own"` grants always deny.
      entities: ({ ctx }) => ({
        userId: ctx.actor.userId,
        memberId: ctx.actor.memberId,
        organizationId: ctx.actor.organizationId,
        teamId: ctx.actor.teamId,
      }),
    })
    .handle(async ({ input, ctx }) => {
      const uniqueSlug = await this.repository.posts.resolveUniqueSlug({
        candidate: slugify(input.slug ?? input.title),
      });
      if (uniqueSlug.isErr()) {
        return err(uniqueSlug.error);
      }

      return this.repository.posts.create({
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
    .handle(async ({ input, state }) => {
      const content = input.content?.trim() ?? state.post.content;

      return this.repository.posts.update({
        id: input.id,
        title: input.title ? input.title.trim() : state.post.title,
        excerpt: createExcerpt(input.excerpt, content),
        content: content.trim(),
      });
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
    .handle(({ input, state }) => {
      return this.repository.posts.update({
        id: input.id,
        status: "published",
        publishedAt: state.post?.publishedAt ?? new Date(),
      });
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
    .handle(async ({ input }) => {
      const updated = await this.repository.posts.update({
        id: input.id,
        deletedAt: new Date(),
      });
      if (updated.isErr()) return err(updated.error);
      return ok({ id: updated.value.id });
    });
}
