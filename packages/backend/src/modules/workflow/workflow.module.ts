import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type { workflows } from "./workflow.db";
import { WorkflowRepository } from "./workflow.repository";
import { WorkflowService } from "./workflow.service";
import { createWorkflowTRPC } from "./workflow.trpc";
import type { WorkflowServiceConfig } from "./workflow.types";

export type WorkflowModuleConfig<Namespace extends string = string> = Omit<
  WorkflowServiceConfig,
  "connection"
> & {
  namespace?: Namespace;
  /**
   * Express mount path for Bull Board. Defaults to `/admin/queues`.
   * Pass `null` to skip mounting the board.
   */
  boardPath?: string | null;
};

type WorkflowModuleDeps = { auth: AuthModule };
type WorkflowModuleTables = { workflows: typeof workflows };
type WorkflowModuleRepositories = {
  workflow: WorkflowRepository;
};
type WorkflowModuleServices = {
  workflow: WorkflowService;
};
type WorkflowModuleRouters<Namespace extends string> = {
  [K in Namespace]: ReturnType<typeof createWorkflowTRPC>;
};

export class WorkflowModule<const Namespace extends string = "workflow"> extends BaseModule<
  WorkflowModuleDeps,
  WorkflowModuleTables,
  WorkflowModuleRepositories,
  WorkflowModuleServices,
  WorkflowModuleRouters<Namespace>
> {
  readonly id = "workflow";
  override readonly dependsOn = ["auth"] as const;

  constructor(private readonly config: WorkflowModuleConfig<Namespace>) {
    super();
  }

  override repositories({
    db,
  }: ModuleRepositoriesContext<WorkflowModuleDeps, WorkflowModuleTables>) {
    return {
      workflow: new WorkflowRepository({
        orm: db.orm,
        schema: db.schema,
      }),
    };
  }

  override services({
    repositories,
    infra,
  }: ModuleServicesContext<WorkflowModuleDeps, WorkflowModuleRepositories>) {
    if (!infra.redis) {
      throw new Error(`Workflow module "${this.id}" requires Redis in createBackendApp(...)`);
    }

    const { namespace: _namespace, boardPath: _boardPath, ...serviceConfig } = this.config;

    return {
      workflow: new WorkflowService(repositories.workflow, {
        ...serviceConfig,
        connection: infra.redis.duplicate(),
      }),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<WorkflowModuleDeps, WorkflowModuleServices>) {
    const namespace = (this.config.namespace ?? "workflow") as Namespace;
    return createBackendRouterMap(namespace, createWorkflowTRPC(trpc, services.workflow));
  }

  override express({
    infra,
    services,
    roleAuthMiddleware,
  }: ModuleExpressContext<WorkflowModuleDeps, WorkflowModuleServices>) {
    if (!roleAuthMiddleware || this.config.boardPath === null) return;

    const boardPath = this.config.boardPath ?? "/admin/queues";
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(boardPath);

    createBullBoard({
      queues: services.workflow.getBullMqQueues().map((queue) => new BullMQAdapter(queue)),
      serverAdapter,
    });

    infra.express.use(boardPath, roleAuthMiddleware("admin"), serverAdapter.getRouter());
  }
}
