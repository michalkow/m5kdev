import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
} from "../base/base.module";
import type * as mcpTables from "./mcp.db";
import { McpRepository } from "./mcp.repository";
import { McpService } from "./mcp.service";

type McpModuleDeps = { auth: AuthModule };
type McpModuleTables = typeof mcpTables;
type McpModuleRepositories = {
  mcp: McpRepository;
};
type McpModuleServices = {
  mcp: McpService;
};

export class McpModule extends BaseModule<
  McpModuleDeps,
  McpModuleTables,
  McpModuleRepositories,
  McpModuleServices,
  never
> {
  readonly id = "mcp";
  override readonly dependsOn = ["auth"] as const;

  override repositories({ db }: ModuleRepositoriesContext<McpModuleDeps, McpModuleTables>) {
    return {
      mcp: new McpRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.mcpAllowlistEntries,
      }),
    };
  }

  override services({
    repositories,
    deps,
  }: ModuleServicesContext<McpModuleDeps, McpModuleRepositories>) {
    return {
      mcp: new McpService(
        repositories.mcp,
        deps.auth.repositories.organization,
        deps.auth.repositories.user
      ),
    };
  }
}
