import { createBackendRouterMap } from "@m5kdev/backend/app";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "@m5kdev/backend/modules/base/base.module";
import type * as postsTables from "./posts.db";
import { postsGrants } from "./posts.grants";
import { PostsRepository } from "./posts.repository";
import { PostsService } from "./posts.service";
import { createPostsTRPC } from "./posts.trpc";

type PostsModuleTables = typeof postsTables;
type PostsModuleRepositories = {
  posts: PostsRepository;
};
type PostsModuleServices = {
  posts: PostsService;
};
type PostsModuleRouters = {
  posts: ReturnType<typeof createPostsTRPC>;
};

export class PostsModule extends BaseModule<
  never,
  PostsModuleTables,
  PostsModuleRepositories,
  PostsModuleServices,
  PostsModuleRouters
> {
  readonly id = "posts";
  override readonly dbDependsOn = ["auth"] as const;

  override repositories({ db }: ModuleRepositoriesContext<never, PostsModuleTables>) {
    return {
      posts: new PostsRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.posts,
      }),
    };
  }

  override services({ repositories }: ModuleServicesContext<never, PostsModuleRepositories>) {
    return {
      posts: new PostsService({ posts: repositories.posts }, {}, postsGrants),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<never, PostsModuleServices>) {
    return createBackendRouterMap("posts", createPostsTRPC(trpc, services.posts));
  }
}
