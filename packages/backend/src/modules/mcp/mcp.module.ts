import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleMcpContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as mcpTables from "./mcp.db";
import { defineUserMcpCall } from "./mcp.define";
import { mountMcpHttp } from "./mcp.http";
import { McpRepository } from "./mcp.repository";
import { McpService } from "./mcp.service";
import { createMcpTRPC } from "./mcp.trpc";
import {
  LIST_ORGANIZATIONS_DESCRIPTION,
  LIST_ORGANIZATIONS_MCP_CALL,
  mcpResourceUrl,
} from "./mcp.types";

type McpModuleDeps = { auth: AuthModule };
type McpModuleTables = typeof mcpTables;
type McpModuleRepositories = {
  mcp: McpRepository;
};
type McpModuleServices = {
  mcp: McpService;
};
type McpModuleRouters = {
  mcp: ReturnType<typeof createMcpTRPC>;
};

export class McpModule extends BaseModule<
  McpModuleDeps,
  McpModuleTables,
  McpModuleRepositories,
  McpModuleServices,
  McpModuleRouters
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

  override trpc({ trpc, services }: ModuleTRPCContext<McpModuleDeps, McpModuleServices>) {
    return createBackendRouterMap("mcp", createMcpTRPC(trpc, services.mcp));
  }

  override mcpUser({ services }: ModuleMcpContext<McpModuleDeps, McpModuleServices>) {
    return {
      [LIST_ORGANIZATIONS_MCP_CALL]: defineUserMcpCall()
        .description(LIST_ORGANIZATIONS_DESCRIPTION)
        .handle((_input, actor, request) =>
          services.mcp.listOrganizations({
            userId: actor.userId,
            oauthClientId: request.oauthClientId,
          })
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
