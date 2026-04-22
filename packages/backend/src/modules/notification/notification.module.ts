import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import type { WorkflowModule } from "../workflow/workflow.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as notificationTables from "./notification.db";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";
import { createNotificationTRPC } from "./notification.trpc";

type NotificationModuleDeps = { auth: AuthModule; workflow: WorkflowModule };
type NotificationModuleTables = typeof notificationTables;
type NotificationModuleRepositories = {
  notification: NotificationRepository;
};
type NotificationModuleServices = {
  notification: NotificationService;
};
type NotificationModuleRouters<Namespace extends string> = {
  [K in Namespace]: ReturnType<typeof createNotificationTRPC>;
};

export class NotificationModule<const Namespace extends string = "notification"> extends BaseModule<
  NotificationModuleDeps,
  NotificationModuleTables,
  NotificationModuleRepositories,
  NotificationModuleServices,
  NotificationModuleRouters<Namespace>
> {
  readonly id = "notification";
  override readonly dependsOn = ["auth", "workflow"] as const;

  constructor(private readonly options: { namespace?: Namespace } = {}) {
    super();
  }

  override repositories({
    db,
  }: ModuleRepositoriesContext<NotificationModuleDeps, NotificationModuleTables>) {
    return {
      notification: new NotificationRepository({
        orm: db.orm,
        schema: db.schema,
      }),
    };
  }

  override services({
    repositories,
    deps,
  }: ModuleServicesContext<NotificationModuleDeps, NotificationModuleRepositories>) {
    return {
      notification: new NotificationService(
        { notification: repositories.notification },
        { workflow: deps.workflow.services.workflow }
      ),
    };
  }

  override trpc({
    trpc,
    services,
  }: ModuleTRPCContext<NotificationModuleDeps, NotificationModuleServices>) {
    const namespace = (this.options.namespace ?? "notification") as Namespace;
    return createBackendRouterMap(namespace, createNotificationTRPC(trpc, services.notification));
  }
}
