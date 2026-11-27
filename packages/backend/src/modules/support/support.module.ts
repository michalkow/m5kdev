import type { Mastra } from "@mastra/core";
import { createBackendRouterMap } from "../../app";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
  type ModuleWorkflowContext,
} from "../../base/base.module";
import type { AIModule } from "../ai/ai.module";
import type { AuthModule } from "../auth/auth.module";
import type { AuthService } from "../auth/auth.service";
import type { FileModule } from "../file/file.module";
import type { TagModule } from "../tag/tag.module";
import type { WorkflowModule } from "../workflow/workflow.module";
import { supportConfigSchema } from "./support.config";
import type * as tables from "./support.db";
import { createSupportProviders, type SupportModels } from "./support.providers";
import { SupportRepository } from "./support.repository";
import { createSupportRouter } from "./support.router";
import { SupportService } from "./support.service";
import { createSupportTRPC } from "./support.trpc";
import type { SupportConfig } from "./support.types";

type Deps = {
  auth: AuthModule;
  file: FileModule;
  tag: TagModule;
  workflow: WorkflowModule;
  ai?: AIModule<Mastra>;
};
type Repositories = { support: SupportRepository };
type Services = { support: SupportService };
export class SupportModule extends BaseModule<
  Deps,
  typeof tables,
  Repositories,
  Services,
  { support: ReturnType<typeof createSupportTRPC> }
> {
  constructor(private readonly config: SupportConfig & { models?: SupportModels } = {}) {
    super();
    supportConfigSchema.parse(config);
  }
  readonly id = "support";
  override readonly optionalDependsOn = ["ai"] as const;
  override readonly dependsOn = ["auth", "file", "tag", "workflow"] as const;
  override repositories({ db }: ModuleRepositoriesContext<Deps, typeof tables>) {
    return { support: new SupportRepository({ orm: db.orm, schema: db.schema }) };
  }
  override services({ repositories, deps, appConfig }: ModuleServicesContext<Deps, Repositories>) {
    if (this.config.models && !deps.ai)
      throw new Error("Support model configuration requires the AI module");
    const providers =
      this.config.models && deps.ai
        ? createSupportProviders(deps.ai.services.ai, this.config.models)
        : {};
    const locales = appConfig.locales?.locales.map((locale) =>
      locale.code.replaceAll("_", "-")
    ) ?? ["en"];
    const support = new SupportService(
      repositories,
      { auth: deps.auth.services.auth as AuthService, file: deps.file.services.file },
      this.config.grants,
      { ...this.config, ...providers, locales }
    );
    deps.auth.services.auth.registerUserLifecycleParticipant("support", {
      beforeClose: (id: string) => support.invalidateUserWork(id, "closed"),
      beforeRestore: (id: string) => support.invalidateUserWork(id, "restored"),
      beforePurge: (id: string) => support.purgeUserData(id),
    });
    return { support };
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
        const docs = await services.support.processDocumentation();
        if (docs.isErr()) throw docs.error;
        const result = await services.support.processWork();
        if (result.isErr()) throw result.error;
      });
    if (!job._handler) throw new Error("Support automation handler missing");
    workflow.registry.register(job, job._handler);
    services.support.bindWorkDispatcher(() => job.trigger({ data: {} }));
    const definition = workflow.service
      .cron({ name: "support.snooze", pattern: "* * * * *" })
      .handle(async () => {
        const docs = await services.support.processDocumentation();
        if (docs.isErr()) throw docs.error;
        const work = await services.support.processWork();
        if (work.isErr()) throw work.error;
        const result = await services.support.wakeSnoozed();
        const cleanup = await services.support.cleanupRevokedFiles();
        const retention = await services.support.cleanupRetention();
        if (result.isErr()) throw result.error;
        if (cleanup.isErr()) throw cleanup.error;
        if (retention.isErr()) throw retention.error;
      });
    if (!definition._handler) throw new Error("Support maintenance handler missing");
    workflow.registry.register(definition, definition._handler);
  }
  override express({ infra, authMiddleware, services }: ModuleExpressContext<Deps, Services>) {
    if (!authMiddleware) throw new Error("Support requires authenticated HTTP");
    infra.express.use("/api/v1/support", createSupportRouter(services.support, authMiddleware));
  }
}
