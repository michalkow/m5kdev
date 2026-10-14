import { toNodeHandler } from "better-auth/node";
import type { RequestHandler } from "express";
import type { BetterAuth } from "../auth/auth.lib";
import {
  MCP_AUTHORIZATION_SERVER_METADATA_PATH,
  MCP_PROTECTED_RESOURCE_METADATA_PATH,
} from "./mcp.types";

export interface McpDiscoveryMount {
  all(path: string, handler: RequestHandler): unknown;
}

export function mountMcpOAuthDiscovery(input: {
  express: McpDiscoveryMount;
  auth: BetterAuth;
}): void {
  const handler = toNodeHandler(input.auth) as RequestHandler;
  for (const path of [
    MCP_PROTECTED_RESOURCE_METADATA_PATH,
    `${MCP_PROTECTED_RESOURCE_METADATA_PATH}/*splat`,
    MCP_AUTHORIZATION_SERVER_METADATA_PATH,
    `${MCP_AUTHORIZATION_SERVER_METADATA_PATH}/*splat`,
  ]) {
    input.express.all(path, handler);
  }
}
