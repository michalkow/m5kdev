import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as workflowTables from "./workflow.db";
import { WorkflowRepository } from "./workflow.repository";
import { WorkflowService } from "./workflow.service";
import { createWorkflowTRPC } from "./workflow.trpc";
import type { WorkflowServiceConfig } from "./workflow.types";

export type WorkflowModuleConfig<Namespace extends string = string> = Omit<
  WorkflowServiceConfig,
  "connection"
> & {
  namespace?: Namespace;
};

type WorkflowModuleDeps = { auth: AuthModule };
type WorkflowModuleTables = typeof workflowTables;
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

  override repositories({ db }: ModuleRepositoriesContext<WorkflowModuleDeps, WorkflowModuleTables>) {
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

    return {
      workflow: new WorkflowService(repositories.workflow, {
        ...this.config,
        connection: infra.redis.duplicate(),
      }),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<WorkflowModuleDeps, WorkflowModuleServices>) {
    const namespace = (this.config.namespace ?? "workflow") as Namespace;
    return createBackendRouterMap(namespace, createWorkflowTRPC(trpc, services.workflow));
  }
}
