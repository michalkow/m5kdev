import { AuthRepository } from "@m5kdev/backend/modules/auth/auth.repository";
import { orm, schema } from "./db";
import { PostsRepository } from "./modules/posts/posts.repository";

export const authRepository = new AuthRepository({ orm, schema });
export const postsRepository = new PostsRepository({ orm, schema, table: schema.posts });
