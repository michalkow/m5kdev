import { defineBackendModules } from "@m5kdev/backend/app";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { templates } from "{{PACKAGE_SCOPE}}/email";
import { postsModule } from "./modules/posts/posts.module";

export const emailBackendModule = new EmailModule(templates as never);

export const authBackendModule = new AuthModule();

export const workflowBackendModule = new WorkflowModule({
  queues: {
    fast: { concurrency: 5 },
  },
  defaultQueue: "fast",
  defaults: {
    timeout: 60_000,
    jobOptions: { removeOnComplete: { age: 3600 } },
  },
});

export const notificationBackendModule = new NotificationModule();
export const postsBackendModule = postsModule;

export const backendModules = defineBackendModules([
  emailBackendModule,
  authBackendModule,
  workflowBackendModule,
  notificationBackendModule,
  postsBackendModule,
] as const);
