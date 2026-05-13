import type { ServerResultAsync } from "@m5kdev/backend/modules/base/base.dto";
import { BaseService } from "@m5kdev/backend/modules/base/base.service";
import type { RequestContext } from "@m5kdev/backend/utils/trpc";
import {
  type Post,
  postCreateSchema,
  postSchema,
} from "m5kdev-auth-e2e-shared/modules/posts/posts.schema";
import { err, ok } from "neverthrow";
import type { PostsRepository } from "./posts.repository";
import { slugify } from "./posts.utils";

export class PostsService extends BaseService<
  {
    posts: PostsRepository;
  },
  Record<string, never>,
  RequestContext
> {
  list = this.procedure("list")
    .output(postSchema.array())
    .requireAuth()
    .handle(async (): ServerResultAsync<Post[]> => {
      return this.repository.posts.listLatest();
    });

  create = this.procedure("create")
    .input(postCreateSchema)
    .output(postSchema)
    .requireAuth("organization")
    .handle(async ({ input, ctx }): ServerResultAsync<Post> => {
      const result = await this.repository.posts.create({
        ...input,
        slug: `${slugify(input.title)}-${Date.now()}`,
        authorUserId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      });
      if (result.isErr()) return err(result.error);
      return ok(result.value);
    });
}
