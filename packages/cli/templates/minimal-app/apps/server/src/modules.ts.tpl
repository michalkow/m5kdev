import { defineBackendModules } from "@m5kdev/backend/app";
import { createAuthBackendModule } from "@m5kdev/backend/modules/auth/auth.module";
import { createEmailBackendModule } from "@m5kdev/backend/modules/email/email.module";
import { createNotificationBackendModule } from "@m5kdev/backend/modules/notification/notification.module";
import { createWorkflowBackendModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { templates } from "{{PACKAGE_SCOPE}}/email";
import { postsModule } from "./modules/posts/posts.module";

export const emailBackendModule = createEmailBackendModule({
  templates: templates as never,
});

export const authBackendModule = createAuthBackendModule({
  emailModuleId: "email",
});

export const workflowBackendModule = createWorkflowBackendModule({
  queues: {
    fast: { concurrency: 5 },
  },
  defaultQueue: "fast",
  defaults: {
    timeout: 60_000,
    jobOptions: { removeOnComplete: { age: 3600 } },
  },
});

export const notificationBackendModule = createNotificationBackendModule();
export const postsBackendModule = postsModule;

export const backendModules = defineBackendModules([
  emailBackendModule,
  authBackendModule,
  workflowBackendModule,
  notificationBackendModule,
  postsBackendModule,
] as const);
