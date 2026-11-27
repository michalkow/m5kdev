import { createBackendRouterMap } from "../../app";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
  type ModuleWorkflowContext,
} from "../../base/base.module";
import type { AuthModule } from "../auth/auth.module";
import type { AuthService } from "../auth/auth.service";
import type { FileModule } from "../file/file.module";
import type { TagModule } from "../tag/tag.module";
import type { WorkflowModule } from "../workflow/workflow.module";
import type * as tables from "./support.db";
import { SupportRepository } from "./support.repository";
import { createSupportRouter } from "./support.router";
import { SupportService } from "./support.service";
import { createSupportTRPC } from "./support.trpc";
import type { SupportConfig } from "./support.types";

type Deps = { auth: AuthModule; file: FileModule; tag: TagModule; workflow: WorkflowModule };
type Repositories = { support: SupportRepository };
type Services = { support: SupportService };
export class SupportModule extends BaseModule<
  Deps,
  typeof tables,
  Repositories,
  Services,
  { support: ReturnType<typeof createSupportTRPC> }
> {
  constructor(private readonly config: SupportConfig = {}) {
    super();
  }
  readonly id = "support";
  override readonly dependsOn = ["auth", "file", "tag", "workflow"] as const;
  override repositories({ db }: ModuleRepositoriesContext<Deps, typeof tables>) {
    return { support: new SupportRepository({ orm: db.orm, schema: db.schema }) };
  }
  override services({ repositories, deps }: ModuleServicesContext<Deps, Repositories>) {
    return {
      support: new SupportService(
        repositories,
        {
          auth: deps.auth.services.auth as AuthService,
          file: deps.file.services.file,
        },
        undefined,
        this.config
      ),
    };
  }
  override trpc({ trpc, services }: ModuleTRPCContext<Deps, Services>) {
    return createBackendRouterMap("support", createSupportTRPC(trpc, services.support));
  }
  override workflows({ workflow, services }: ModuleWorkflowContext<Deps, Services>) {
    if (!workflow) throw new Error("Support requires Workflow");
    const job = workflow.service
      .job<{ data: Record<string, never> }>({
        name: "support.automation",
        retries: 1,
        timeout: 70000,
      })
      .handle(async () => {
        const result = await services.support.processWork();
        if (result.isErr()) throw result.error;
      });
    if (!job._handler) throw new Error("Support automation handler missing");
    workflow.registry.register(job, job._handler);
    services.support.bindWorkDispatcher(() => job.trigger({ data: {} }));
    const definition = workflow.service
      .cron({ name: "support.snooze", pattern: "* * * * *" })
      .handle(async () => {
        const work = await services.support.processWork();
        if (work.isErr()) throw work.error;
        const cleanup = await services.support.cleanupRevokedFiles();
        if (cleanup.isErr()) throw cleanup.error;
        const result = await services.support.wakeSnoozed();
        if (result.isErr()) throw result.error;
      });
    workflow.registry.register(definition, definition._handler!);
  }
  override express({ infra, authMiddleware, services }: ModuleExpressContext<Deps, Services>) {
    if (!authMiddleware) throw new Error("Support requires authenticated HTTP");
    infra.express.use("/api/v1/support", createSupportRouter(services.support, authMiddleware));
  }
}
