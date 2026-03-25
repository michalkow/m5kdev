import { AuthService } from "@m5kdev/backend/modules/auth/auth.service";
import { LocalEmailService } from "./lib/localEmailService";
import { postsGrants } from "./modules/posts/posts.grants";
import { PostsService } from "./modules/posts/posts.service";
import { authRepository, postsRepository } from "./repository";

export const emailService = new LocalEmailService({
  appName: "{{APP_NAME}}",
  appUrl: process.env.VITE_APP_URL ?? "http://localhost:5173",
});

export const authService = new AuthService({ auth: authRepository }, { email: emailService });
export const postsService = new PostsService({ posts: postsRepository }, {}, postsGrants);
