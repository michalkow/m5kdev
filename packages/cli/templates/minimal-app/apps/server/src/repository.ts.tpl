import { AuthRepository } from "@m5kdev/backend/modules/auth/auth.repository";
import { NotificationRepository } from "@m5kdev/backend/modules/notification/notification.repository";
import { WorkflowRepository } from "@m5kdev/backend/modules/workflow/workflow.repository";
import { orm, schema } from "./db";
import { PostsRepository } from "./modules/posts/posts.repository";

export const authRepository = new AuthRepository({ orm, schema });
export const workflowRepository = new WorkflowRepository({ orm, schema });
export const notificationRepository = new NotificationRepository({ orm, schema });
export const postsRepository = new PostsRepository({ orm, schema, table: schema.posts });
