import type { ZodType } from "zod";
import type { OrganizationActor } from "../../base/base.actor";

export const LIST_ORGANIZATIONS_MCP_CALL = "list-organizations";

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
