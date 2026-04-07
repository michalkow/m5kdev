import { AuthService } from "@m5kdev/backend/modules/auth/auth.service";
import { NotificationService } from "@m5kdev/backend/modules/notification/notification.service";
import { LocalEmailService } from "./lib/localEmailService";
import { postsGrants } from "./modules/posts/posts.grants";
import { PostsService } from "./modules/posts/posts.service";
import { authRepository, notificationRepository, postsRepository } from "./repository";
import { workflowService } from "./workflow";

export const emailService = new LocalEmailService({
  appName: "{{APP_NAME}}",
  appUrl: process.env.VITE_APP_URL ?? "http://localhost:5173",
});

export const authService = new AuthService({ auth: authRepository }, { email: emailService });
export const postsService = new PostsService({ posts: postsRepository }, {}, postsGrants);
export const notificationService = new NotificationService(
  { notification: notificationRepository },
  { workflow: workflowService },
);
