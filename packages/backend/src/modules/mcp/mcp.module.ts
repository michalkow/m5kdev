import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
} from "../base/base.module";
import type * as mcpTables from "./mcp.db";
import { mountMcpHttp } from "./mcp.http";
import { McpRepository } from "./mcp.repository";
import { McpService } from "./mcp.service";
import { mcpResourceUrl } from "./mcp.types";

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

  override express({
    infra,
    services,
    auth,
    appConfig,
  }: ModuleExpressContext<McpModuleDeps, McpModuleServices>) {
    if (!auth) return;
    const apiUrl = appConfig.urls.api;
    if (!apiUrl) return;
    mountMcpHttp({
      express: infra.express,
      mcp: services.mcp,
      auth,
      resource: mcpResourceUrl(apiUrl),
      serverName: appConfig.name ?? "m5kdev",
    });
  }
}
