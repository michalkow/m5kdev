import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { BetterAuth } from "../auth/auth.lib";
import { invokeMcpTool, isArgumentRecord, mcpToolInputSchema } from "./mcp.protocol";
import type { McpService } from "./mcp.service";
import {
  MCP_AUTHORIZATION_SERVER_METADATA_PATH,
  MCP_HTTP_PATH,
  MCP_PROTECTED_RESOURCE_METADATA_PATH,
} from "./mcp.types";

interface McpAccessTokenClaims {
  sub?: unknown;
  exp?: number;
  scope?: unknown;
  [key: string]: unknown;
}

function readJwtStringClaim(jwt: McpAccessTokenClaims, key: string): string | undefined {
  const value = jwt[key];
  return typeof value === "string" ? value : undefined;
}

function bearerToken(request: Request | globalThis.Request): string {
  const header =
    request instanceof globalThis.Request
      ? request.headers.get("authorization")
      : request.get("authorization");
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? "";
}

interface McpRequestAuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number | undefined;
  extra: { userId: string; clientId: string };
}

function mcpAuthInfoFromJwt(
  jwt: McpAccessTokenClaims,
  request: globalThis.Request
): McpRequestAuthInfo {
  const clientId = readJwtStringClaim(jwt, "client_id") ?? readJwtStringClaim(jwt, "azp") ?? "";
  const userId = typeof jwt.sub === "string" ? jwt.sub : "";
  const scope = typeof jwt.scope === "string" ? jwt.scope.split(" ").filter(Boolean) : [];
  return {
    token: bearerToken(request),
    clientId,
    scopes: scope,
    expiresAt: jwt.exp,
    extra: { userId, clientId },
  };
}

function expressRequestToWeb(req: Request): globalThis.Request {
  const host = req.get("host") ?? "localhost";
  const url = `${req.protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  return new globalThis.Request(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });
}

async function writeWebResponse(res: Response, response: globalThis.Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.send(body);
}

export function createMcpExpressHandler(input: {
  mcp: McpService;
  auth: BetterAuth;
  resource: string;
  serverName: string;
}): RequestHandler {
  const mcpHttp = createMcpHandler(
    (ctx) => {
      const server = new McpServer({
        name: input.serverName,
        version: "1.0.0",
      });
      for (const entry of input.mcp.listCatalog()) {
        const definition = input.mcp.getCall(entry.name);
        server.registerTool(
          entry.name,
          {
            description: entry.description,
            inputSchema: mcpToolInputSchema(entry, definition),
          },
          async (args) => {
            const extra = ctx.authInfo?.extra;
            const userId = typeof extra?.userId === "string" ? extra.userId : "";
            const oauthClientId = ctx.authInfo?.clientId ?? "";
            const result = await invokeMcpTool({
              invoke: (payload) => input.mcp.invoke(payload),
              userId,
              oauthClientId,
              name: entry.name,
              arguments: isArgumentRecord(args) ? args : {},
            });
            if (result.isError) {
              return {
                isError: true,
                content: result.content,
              };
            }
            return {
              content: result.content,
            };
          }
        );
      }
      return server;
    },
    { legacy: "reject" }
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const request = expressRequestToWeb(req);
      const response = await requireMcpAuth(
        input.auth,
        async (webRequest, jwt) => {
          return mcpHttp.fetch(webRequest, {
            authInfo: mcpAuthInfoFromJwt(jwt, webRequest),
            parsedBody: req.body,
          });
        },
        { resource: input.resource }
      )(request);
      await writeWebResponse(res, response);
    })().catch(next);
  };
}

interface McpExpressMount {
  post(path: string, handler: RequestHandler): unknown;
  all(path: string, handler: RequestHandler): unknown;
}

function mountMcpOAuthDiscovery(input: { express: McpExpressMount; auth: BetterAuth }): void {
  const handler = toNodeHandler(input.auth);
  for (const path of [
    MCP_PROTECTED_RESOURCE_METADATA_PATH,
    `${MCP_PROTECTED_RESOURCE_METADATA_PATH}/*`,
    MCP_AUTHORIZATION_SERVER_METADATA_PATH,
    `${MCP_AUTHORIZATION_SERVER_METADATA_PATH}/*`,
  ]) {
    input.express.all(path, handler);
  }
}

export function mountMcpHttp(input: {
  express: McpExpressMount;
  mcp: McpService;
  auth: BetterAuth;
  resource: string;
  serverName: string;
}): void {
  mountMcpOAuthDiscovery({ express: input.express, auth: input.auth });
  input.express.post(
    MCP_HTTP_PATH,
    createMcpExpressHandler({
      mcp: input.mcp,
      auth: input.auth,
      resource: input.resource,
      serverName: input.serverName,
    })
  );
}
