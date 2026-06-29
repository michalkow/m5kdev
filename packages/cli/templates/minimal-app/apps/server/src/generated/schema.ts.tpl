import * as authTables from "@m5kdev/backend/modules/auth/auth.db";
import * as notificationTables from "@m5kdev/backend/modules/notification/notification.db";
import * as workflowTables from "@m5kdev/backend/modules/workflow/workflow.db";
import * as postsTables from "../modules/posts/posts.db";

export const schema = {
  ...authTables,
  ...workflowTables,
  ...notificationTables,
  ...postsTables,
};

export type AppDbSchema = typeof schema;
