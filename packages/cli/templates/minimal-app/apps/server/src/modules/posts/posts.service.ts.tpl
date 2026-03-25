import type {
  PostCreateInputSchema,
  PostCreateOutputSchema,
  PostPublishInputSchema,
  PostPublishOutputSchema,
  PostSoftDeleteInputSchema,
  PostSoftDeleteOutputSchema,
  PostsListInputSchema,
  PostsListOutputSchema,
  PostUpdateInputSchema,
  PostUpdateOutputSchema,
} from "{{PACKAGE_SCOPE}}/shared/modules/posts/posts.schema";
import type { Context } from "@m5kdev/backend/modules/auth/auth.lib";
import { BasePermissionService } from "@m5kdev/backend/modules/base/base.service";
import type { ServerResultAsync } from "@m5kdev/backend/utils/types";
import { err, ok } from "neverthrow";
import type { PostsRepository } from "./posts.repository";

type RequestContext = Context;

export class PostsService extends BasePermissionService<
  { posts: PostsRepository },
  Record<string, never>,
  RequestContext
> {
  readonly list = this.procedure<PostsListInputSchema>("list")
    .requireAuth()
    .handle(({ input }): ServerResultAsync<PostsListOutputSchema> => {
      return this.repository.posts.list(input);
    });

  readonly create = this.procedure<PostCreateInputSchema>("create")
    .requireAuth()
    .access({
      action: "write",
      entities: ({ ctx }) => ({
        organizationId: ctx.session.activeOrganizationId ?? null,
        teamId: ctx.session.activeTeamId ?? null,
      }),
    })
    .handle(async ({ input, ctx }): ServerResultAsync<PostCreateOutputSchema> => {
      const uniqueSlug = await this.repository.posts.resolveUniqueSlug(
        this.slugify(input.slug ?? input.title)
      );
      if (uniqueSlug.isErr()) {
        return err(uniqueSlug.error);
      }

      return this.repository.posts.create({
        authorUserId: ctx.user.id,
        organizationId: ctx.session.activeOrganizationId ?? null,
        teamId: ctx.session.activeTeamId ?? null,
        title: input.title.trim(),
        slug: uniqueSlug.value,
        excerpt: this.createExcerpt(input.excerpt, input.content),
        content: input.content.trim(),
        status: "draft",
      }) as ServerResultAsync<PostCreateOutputSchema>;
    });

  readonly update = this.procedure<PostUpdateInputSchema>("update")
    .requireAuth()
    .use("post", async ({ input }) => {
      const current = await this.repository.posts.findById(input.id);
      if (current.isErr()) {
        return err(current.error);
      }
      if (!current.value || current.value.deletedAt) {
        return this.error("NOT_FOUND", "Post not found");
      }

      return current.value;
    })
    .access({
      action: "write",
      entityStep: "post",
    })
    .handle(async ({ input }): ServerResultAsync<PostUpdateOutputSchema> => {
      const uniqueSlug = await this.repository.posts.resolveUniqueSlug(
        this.slugify(input.slug ?? input.title),
        input.id
      );
      if (uniqueSlug.isErr()) {
        return err(uniqueSlug.error);
      }

      return this.repository.posts.update({
        id: input.id,
        title: input.title.trim(),
        slug: uniqueSlug.value,
        excerpt: this.createExcerpt(input.excerpt, input.content),
        content: input.content.trim(),
      }) as ServerResultAsync<PostUpdateOutputSchema>;
    });

  readonly publish = this.procedure<PostPublishInputSchema>("publish")
    .requireAuth()
    .use("post", async ({ input }) => {
      const current = await this.repository.posts.findById(input.id);
      if (current.isErr()) {
        return err(current.error);
      }
      if (!current.value || current.value.deletedAt) {
        return this.error("NOT_FOUND", "Post not found");
      }

      return current.value;
    })
    .access({
      action: "publish",
      entityStep: "post",
    })
    .handle(({ input, state }): ServerResultAsync<PostPublishOutputSchema> => {
      return this.repository.posts.update({
        id: input.id,
        status: "published",
        publishedAt: state.post.publishedAt ?? new Date(),
      }) as ServerResultAsync<PostPublishOutputSchema>;
    });

  readonly softDelete = this.procedure<PostSoftDeleteInputSchema>("softDelete")
    .requireAuth()
    .use("post", async ({ input }) => {
      const current = await this.repository.posts.findById(input.id);
      if (current.isErr()) {
        return err(current.error);
      }
      if (!current.value || current.value.deletedAt) {
        return this.error("NOT_FOUND", "Post not found");
      }

      return current.value;
    })
    .access({
      action: "delete",
      entityStep: "post",
    })
    .handle(async ({ input }): ServerResultAsync<PostSoftDeleteOutputSchema> => {
      const updated = await this.repository.posts.update({
        id: input.id,
        deletedAt: new Date(),
      });

      if (updated.isErr()) {
        return err(updated.error);
      }

      return ok({ id: updated.value.id });
    });

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/g, "")
      .replace(/-+$/g, "")
      .replace(/-{2,}/g, "-");

    return slug || "post";
  }

  private createExcerpt(excerpt: string | undefined, content: string): string {
    if (excerpt?.trim()) {
      return excerpt.trim();
    }

    return content.replace(/\s+/g, " ").trim().slice(0, 180);
  }
}
