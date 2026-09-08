import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp as mcpPlugin } from "@better-auth/mcp";
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";
import { fetchE2eMcpClientMetadata, isE2eMcpCimdEnabled } from "./auth.mcp-e2e";

export interface McpOAuthPluginConfig {
  resource: string;
  loginPage: string;
  consentPage: string;
}

export function createMcpOAuthPlugins(mcp: McpOAuthPluginConfig | undefined): BetterAuthPlugin[] {
  if (!mcp) return [];
  return [
    jwt({
      disableSettingJwtHeader: true,
      schema: { jwks: { modelName: "jwk" } },
    }),
    mcpPlugin({
      loginPage: mcp.loginPage,
      consentPage: mcp.consentPage,
      resource: mcp.resource,
    }),
    cimd({
      fetchClientMetadataResource: isE2eMcpCimdEnabled()
        ? fetchE2eMcpClientMetadata
        : fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ];
}
