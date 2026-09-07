import type { Result } from "neverthrow";
import { z } from "zod";
import type { ServerError } from "../../utils/errors";
import type { McpCatalogEntry, McpInvokeInput, McpRegisteredCall } from "./mcp.types";

export interface McpToolTextContent {
  type: "text";
  text: string;
}

export interface McpToolCallResult {
  isError?: boolean;
  content: McpToolTextContent[];
}

export function mcpToolInputSchema(
  entry: Pick<McpCatalogEntry, "requiresOrganizationId">,
  definition?: Pick<McpRegisteredCall, "inputSchema">
): z.ZodObject<z.ZodRawShape> {
  if (!entry.requiresOrganizationId) {
    return z.object({});
  }
  const domainSchema = definition?.inputSchema;
  const domainShape =
    domainSchema && typeof domainSchema === "object" && "shape" in domainSchema
      ? (domainSchema as z.ZodObject<z.ZodRawShape>).shape
      : {};
  return z.object({
    organizationId: z.string().min(1),
    ...domainShape,
  });
}

export async function invokeMcpTool(input: {
  invoke: (args: McpInvokeInput) => Promise<Result<unknown, ServerError>>;
  userId: string;
  oauthClientId: string;
  name: string;
  arguments: Record<string, unknown>;
}): Promise<McpToolCallResult> {
  const result = await input.invoke({
    userId: input.userId,
    oauthClientId: input.oauthClientId,
    name: input.name,
    arguments: input.arguments,
  });
  if (result.isErr()) {
    return {
      isError: true,
      content: [{ type: "text", text: result.error.message }],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result.value ?? null) }],
  };
}

export function isArgumentRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
