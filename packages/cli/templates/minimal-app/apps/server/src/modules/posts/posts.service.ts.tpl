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
import { BaseService } from "@m5kdev/backend/modules/base/base.service";
import type { ServerResultAsync } from "@m5kdev/backend/utils/types";
import { err, ok } from "neverthrow";
import type { PostsRepository } from "./posts.repository";

type RequestContext = {
  session: {
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  };
  user: {
    id: string;
  };
};

export class PostsService extends BaseService<{ posts: PostsRepository }, Record<string, never>> {
  async list(
    input: PostsListInputSchema,
    _ctx: RequestContext
  ): ServerResultAsync<PostsListOutputSchema> {
    return this.repository.posts.list(input);
  }

  async create(
    input: PostCreateInputSchema,
    ctx: RequestContext
  ): ServerResultAsync<PostCreateOutputSchema> {
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
  }

  async update(
    input: PostUpdateInputSchema,
    _ctx: RequestContext
  ): ServerResultAsync<PostUpdateOutputSchema> {
    const current = await this.repository.posts.findById(input.id);
    if (current.isErr()) {
      return err(current.error);
    }
    if (!current.value || current.value.deletedAt) {
      return this.error("NOT_FOUND", "Post not found");
    }

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
  }

  async publish(
    input: PostPublishInputSchema,
    _ctx: RequestContext
  ): ServerResultAsync<PostPublishOutputSchema> {
    const current = await this.repository.posts.findById(input.id);
    if (current.isErr()) {
      return err(current.error);
    }
    if (!current.value || current.value.deletedAt) {
      return this.error("NOT_FOUND", "Post not found");
    }

    return this.repository.posts.update({
      id: input.id,
      status: "published",
      publishedAt: current.value.publishedAt ?? new Date(),
    }) as ServerResultAsync<PostPublishOutputSchema>;
  }

  async softDelete(
    input: PostSoftDeleteInputSchema,
    _ctx: RequestContext
  ): ServerResultAsync<PostSoftDeleteOutputSchema> {
    const current = await this.repository.posts.findById(input.id);
    if (current.isErr()) {
      return err(current.error);
    }
    if (!current.value || current.value.deletedAt) {
      return this.error("NOT_FOUND", "Post not found");
    }

    const updated = await this.repository.posts.update({
      id: input.id,
      deletedAt: new Date(),
    });

    if (updated.isErr()) {
      return err(updated.error);
    }

    return ok({ id: updated.value.id });
  }

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
