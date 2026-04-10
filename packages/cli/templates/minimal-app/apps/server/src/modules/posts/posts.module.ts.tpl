import { defineBackendModule } from "@m5kdev/backend/app";
import { createPostsTRPC } from "./posts.trpc";
import { createPostsTables } from "./posts.db";
import { postsGrants } from "./posts.grants";
import { PostsRepository } from "./posts.repository";
import { PostsService } from "./posts.service";

export const postsModule = defineBackendModule({
  id: "posts",
  dependsOn: ["auth"],
  db: ({ deps }) => {
    const authTables = deps.auth.tables as any;
    return {
      tables: createPostsTables({
        users: authTables.users,
        organizations: authTables.organizations,
        teams: authTables.teams,
      }),
    };
  },
  repositories: ({ db }) => {
    const schema = db.schema as any;
    return {
      posts: new PostsRepository({
        orm: db.orm as never,
        schema: { posts: schema.posts } as never,
        table: schema.posts,
      }),
    };
  },
  services: ({ repositories }) => ({
    posts: new PostsService({ posts: repositories.posts }, {}, postsGrants),
  }),
  trpc: ({ trpc, services }) => ({
    posts: createPostsTRPC(trpc, services.posts),
  }),
});
