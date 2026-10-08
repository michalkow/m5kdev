export const LIST_ORGANIZATIONS_MCP_CALL = "list-organizations";
export const LIST_ORGANIZATIONS_DESCRIPTION =
  "List Organizations this MCP client may use. Call this before org-scoped MCP calls to learn organizationId values.";
export const MCP_HTTP_PATH = "/mcp";
export const MCP_PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const MCP_AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
/** Better Auth `basePath`; RFC 8414 inserts this after the well-known prefix. */
export const MCP_AUTH_ISSUER_PATH = "/api/auth";

export function mcpResourceUrl(apiUrl: string): string {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  return new URL("mcp", base).href;
}

export interface McpListedOrganization {
  id: string;
  name: string;
  organizationRole: string;
}

export interface McpConsentOrganization {
  id: string;
  name: string;
  allowlisted: boolean;
}

export interface McpCatalogEntry {
  name: string;
  description: string;
  requiresOrganizationId: boolean;
}

export interface McpInvokeInput {
  userId: string;
  oauthClientId: string;
  name: string;
  arguments: Record<string, unknown>;
}
