import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { mcpConsentSchemas, mcpOrganizationSchemas } from "./mcp.dto";
import type { McpService } from "./mcp.service";
import { LIST_ORGANIZATIONS_DESCRIPTION, LIST_ORGANIZATIONS_MCP_CALL } from "./mcp.types";

export function createMcpTRPC(
  { router, privateProcedure, userProcedure }: TRPCMethods,
  mcpService: McpService
) {
  return router({
    listOrganizations: userProcedure
      .meta({
        mcp: { name: LIST_ORGANIZATIONS_MCP_CALL, description: LIST_ORGANIZATIONS_DESCRIPTION },
      })
      .output(mcpOrganizationSchemas.output.organizations)
      .query(async ({ ctx }) =>
        handleTRPCResult(
          await mcpService.listOrganizations({
            userId: ctx.actor.userId,
            // oauthClientId exists only on MCP in-process calls; without one no allowlist matches (fail-closed → empty list).
            oauthClientId: ctx.oauthClientId ?? "",
          })
        )
      ),

    listConsentOrganizations: privateProcedure
      .input(mcpConsentSchemas.input.listConsentOrganizations)
      .output(mcpConsentSchemas.output.organizations)
      .query(async ({ ctx, input }) =>
        handleTRPCResult(
          await mcpService.listConsentOrganizations({
            userId: ctx.actor.userId,
            oauthClientId: input.oauthClientId,
          })
        )
      ),

    replaceConsentAllowlist: privateProcedure
      .input(mcpConsentSchemas.input.replaceConsentAllowlist)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(
          await mcpService.replaceConsentAllowlist({
            userId: ctx.actor.userId,
            oauthClientId: input.oauthClientId,
            organizationIds: input.organizationIds,
          })
        )
      ),
  });
}
