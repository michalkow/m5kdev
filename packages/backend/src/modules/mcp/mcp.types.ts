import type { ZodType } from "zod";
import type { OrganizationActor } from "../../base/base.actor";

export const LIST_ORGANIZATIONS_MCP_CALL = "list-organizations";
export const MCP_HTTP_PATH = "/mcp";
export const MCP_PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const MCP_AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

export function mcpResourceUrl(apiUrl: string): string {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  return new URL("mcp", base).href;
}

export interface McpCallDefinition<TInput = unknown> {
  readonly mcpCall: true;
  readonly description: string;
  inputSchema: ZodType<TInput>;
  _handler?: (input: TInput, actor: OrganizationActor) => unknown;
  input(schema: ZodType<TInput>): McpCallDefinition<TInput>;
  handle(handler: (input: TInput, actor: OrganizationActor) => unknown): McpCallDefinition<TInput>;
}

export interface McpListedOrganization {
  id: string;
  name: string;
  organizationRole: string;
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
