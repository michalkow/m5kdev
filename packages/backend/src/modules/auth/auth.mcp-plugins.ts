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
      // MCP 2026-07-28 prefers CIMD; Cursor still requires RFC 7591 DCR
      // (`registration_endpoint` in AS metadata). Better Auth leaves DCR off
      // unless both flags are set.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({
      fetchClientMetadataResource: isE2eMcpCimdEnabled()
        ? fetchE2eMcpClientMetadata
        : fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ];
}
