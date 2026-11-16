import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp as mcpPlugin } from "@better-auth/mcp";
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcpIssuerUrl } from "../mcp/mcp.types";
import { fetchE2eMcpClientMetadata, isE2eMcpCimdEnabled } from "./auth.mcp-e2e";

export interface McpOAuthPluginConfig {
  resource: string;
  issuer?: string;
  loginPage: string;
  consentPage: string;
}

export function createMcpOAuthPlugins(mcp: McpOAuthPluginConfig | undefined): BetterAuthPlugin[] {
  if (!mcp) return [];
  const issuer = mcp.issuer ?? mcpIssuerUrl(new URL(mcp.resource).origin);
  const provider = betterAuthPlugin({
    plugin: mcpPlugin({
      loginPage: mcp.loginPage,
      consentPage: mcp.consentPage,
      resource: mcp.resource,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    name: "mcp",
  });
  return [
    jwt({
      disableSettingJwtHeader: true,
      schema: { jwks: { modelName: "jwk" } },
      jwt: { issuer },
    }),
    {
      ...provider,
      // Only discovery uses the canonical context. Browser auth remains domain-local;
      // this never makes an unknown incoming host a trusted Better Auth host.
      onRequest: async (request, ctx) => provider.onRequest?.(request, { ...ctx, baseURL: issuer }),
    },
    cimd({
      fetchClientMetadataResource: isE2eMcpCimdEnabled()
        ? fetchE2eMcpClientMetadata
        : fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ];
}

function isBetterAuthPlugin(value: unknown): value is BetterAuthPlugin {
  return (
    typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"
  );
}

function betterAuthPlugin(input: { plugin: unknown; name: string }): BetterAuthPlugin {
  if (!isBetterAuthPlugin(input.plugin)) {
    throw new Error(`${input.name} is not a Better Auth plugin`);
  }
  return input.plugin;
}
