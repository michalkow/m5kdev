import { createBackendRouterMap } from "@m5kdev/backend/app";
import type { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
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

type PostsModuleDeps = { auth: AuthModule };
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
  PostsModuleDeps,
  PostsModuleTables,
  PostsModuleRepositories,
  PostsModuleServices,
  PostsModuleRouters
> {
  readonly id = "posts";
  override readonly dependsOn = ["auth"] as const;

  override repositories({ db }: ModuleRepositoriesContext<PostsModuleDeps, PostsModuleTables>) {
    return {
      posts: new PostsRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.posts,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<PostsModuleDeps, PostsModuleRepositories>) {
    return {
      posts: new PostsService({ posts: repositories.posts }, {}, postsGrants),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<PostsModuleDeps, PostsModuleServices>) {
    return createBackendRouterMap("posts", createPostsTRPC(trpc, services.posts));
  }
}

export const postsModule = new PostsModule();
