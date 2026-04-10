import { defineBackendModule } from "../../app";
import { createNotificationTables } from "./notification.db";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";
import { createNotificationTRPC } from "./notification.trpc";

export type CreateNotificationBackendModuleOptions = {
  id?: string;
  namespace?: string;
  authModuleId?: string;
  workflowModuleId?: string;
};

export function createNotificationBackendModule(
  options: CreateNotificationBackendModuleOptions = {}
) {
  const id = options.id ?? "notification";
  const namespace = options.namespace ?? "notification";
  const authModuleId = options.authModuleId ?? "auth";
  const workflowModuleId = options.workflowModuleId ?? "workflow";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId, workflowModuleId],
    db: ({ deps }) => {
      const authTables = deps[authModuleId].tables as any;
      return {
      tables: createNotificationTables({
        users: authTables.users,
      }),
      };
    },
    repositories: ({ db }) => ({
      notification: new NotificationRepository({
        orm: db.orm as never,
        schema: db.schema as never,
      }),
    }),
    services: ({ repositories, deps }) => ({
      notification: new NotificationService(
        { notification: repositories.notification },
        { workflow: deps[workflowModuleId].services.workflow }
      ),
    }),
    trpc: ({ trpc, services }) => ({
      [namespace]: createNotificationTRPC(trpc, services.notification),
    }),
  });
}
