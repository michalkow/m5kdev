import { createBackendRouterMap } from "@m5kdev/backend/app";
import type { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import {
  BaseModule,
  type ModuleServicesContext,
  type ModuleTRPCContext,
  type TableMap,
} from "@m5kdev/backend/modules/base/base.module";
import type { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { DemoWorkflowService } from "./demo-workflow.service";
import { createDemoWorkflowTRPC } from "./demo-workflow.trpc";

type DemoWorkflowModuleDeps = { workflow: WorkflowModule; auth: AuthModule };
type DemoWorkflowModuleServices = {
  demoWorkflow: DemoWorkflowService;
};
type DemoWorkflowModuleRouters = {
  demoWorkflow: ReturnType<typeof createDemoWorkflowTRPC>;
};

export class DemoWorkflowModule extends BaseModule<
  DemoWorkflowModuleDeps,
  TableMap,
  Record<string, never>,
  DemoWorkflowModuleServices,
  DemoWorkflowModuleRouters
> {
  readonly id = "demo-workflow";
  override readonly dependsOn = ["workflow", "auth"] as const;

  override services({
    deps,
  }: ModuleServicesContext<DemoWorkflowModuleDeps, Record<string, never>>) {
    return {
      demoWorkflow: new DemoWorkflowService({
        workflow: deps.workflow.services.workflow,
        auth: deps.auth.services.auth,
      }),
    };
  }

  override trpc({
    trpc,
    services,
  }: ModuleTRPCContext<DemoWorkflowModuleDeps, DemoWorkflowModuleServices>) {
    return createBackendRouterMap(
      "demoWorkflow",
      createDemoWorkflowTRPC(trpc, services.demoWorkflow)
    );
  }
}
