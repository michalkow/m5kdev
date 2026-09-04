import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { mcpConsentSchemas } from "./mcp.dto";
import type { McpService } from "./mcp.service";

export function createMcpTRPC({ router, privateProcedure }: TRPCMethods, mcpService: McpService) {
  return router({
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
