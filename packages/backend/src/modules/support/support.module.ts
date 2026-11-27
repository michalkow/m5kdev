import { createBackendRouterMap } from "../../app";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
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
  readonly id = "support";
  override readonly dependsOn = ["auth", "file", "tag", "workflow"] as const;
  override repositories({ db }: ModuleRepositoriesContext<Deps, typeof tables>) {
    return { support: new SupportRepository({ orm: db.orm, schema: db.schema }) };
  }
  override services({ repositories, deps }: ModuleServicesContext<Deps, Repositories>) {
    return {
      support: new SupportService(repositories, { auth: deps.auth.services.auth as AuthService }),
    };
  }
  override trpc({ trpc, services }: ModuleTRPCContext<Deps, Services>) {
    return createBackendRouterMap("support", createSupportTRPC(trpc, services.support));
  }
  override express({ infra, authMiddleware, services }: ModuleExpressContext<Deps, Services>) {
    if (!authMiddleware) throw new Error("Support requires authenticated HTTP");
    infra.express.use("/api/v1/support", createSupportRouter(services.support, authMiddleware));
  }
}
