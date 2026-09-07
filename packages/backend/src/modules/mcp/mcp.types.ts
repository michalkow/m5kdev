import type { ZodType } from "zod";
import type { OrganizationActor, UserActor } from "../../base/base.actor";

export const LIST_ORGANIZATIONS_MCP_CALL = "list-organizations";
export const LIST_ORGANIZATIONS_DESCRIPTION =
  "List Organizations this MCP client may use. Call this before org-scoped MCP calls to learn organizationId values.";
export const MCP_HTTP_PATH = "/mcp";
export const MCP_PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const MCP_AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

export function mcpResourceUrl(apiUrl: string): string {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  return new URL("mcp", base).href;
}

export interface McpUserCallRequest {
  oauthClientId: string;
}

export interface McpOrganizationCallDefinition<TInput = unknown> {
  readonly scope: "organization";
  readonly description: string;
  readonly inputSchema: ZodType<TInput>;
  handle(input: TInput, actor: OrganizationActor): unknown;
}

export interface McpUserCallDefinition<TInput = unknown> {
  readonly scope: "user";
  readonly description: string;
  readonly inputSchema: ZodType<TInput>;
  handle(input: TInput, actor: UserActor, request: McpUserCallRequest): unknown;
}

export type McpRegisteredCall<TInput = unknown> =
  | McpOrganizationCallDefinition<TInput>
  | McpUserCallDefinition<TInput>;

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

export interface McpRegisterCallsOptions {
  moduleId?: string;
}
