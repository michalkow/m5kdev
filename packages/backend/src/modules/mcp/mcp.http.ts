import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { createDpopReplayStore } from "better-auth/oauth2";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Result } from "neverthrow";
import type { ServerError } from "../../utils/errors";
import { handleTRPCResult } from "../../utils/trpc";
import type { BetterAuth } from "../auth/auth.lib";
import type { McpToolBinding } from "./mcp.adapter";
import { invokeMcpTool, isArgumentRecord } from "./mcp.protocol";
import type { McpInvokeInput } from "./mcp.types";
import { MCP_HTTP_PATH } from "./mcp.types";

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
  tools: readonly McpToolBinding[];
  /** Per-request discovery filter; direct composition may keep a static catalog. */
  listTools?: (caller: {
    userId: string;
    oauthClientId: string;
  }) => Promise<Result<readonly McpToolBinding[], ServerError>>;
  invoke: (payload: McpInvokeInput) => Promise<Result<unknown, ServerError>>;
  auth: BetterAuth;
  resource: string;
  /** Canonical Auth issuer; required when Better Auth uses a dynamic baseURL. */
  issuer?: string;
  serverName: string;
}): RequestHandler {
  if (typeof input.auth.options.baseURL === "object" && !input.issuer)
    throw new Error("Dynamic Auth requires an explicit canonical MCP issuer");
  const mcpHttp = createMcpHandler(
    async (ctx) => {
      const extra = ctx.authInfo?.extra;
      const userId = typeof extra?.userId === "string" ? extra.userId : "";
      const oauthClientId = ctx.authInfo?.clientId ?? "";
      const tools = input.listTools
        ? handleTRPCResult(await input.listTools({ userId, oauthClientId }))
        : input.tools;
      const server = new McpServer({
        name: input.serverName,
        version: "1.0.0",
      });
      for (const tool of tools) {
        server.registerTool(
          tool.name,
          {
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
          async (args) => {
            const result = await invokeMcpTool({
              invoke: (payload) => input.invoke(payload),
              userId,
              oauthClientId,
              name: tool.name,
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
    // Cursor still initializes with MCP 2025-11-25. Stateless legacy keeps
    // 2026-07-28 clients working while accepting that negotiate.
    { legacy: "stateless" }
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const request = expressRequestToWeb(req);
      const { baseURL, internalAdapter } = await input.auth.$context;
      const issuer = baseURL || input.issuer;
      if (!issuer)
        throw new Error(
          "Auth requires an explicit canonical MCP issuer when its effective baseURL is empty"
        );
      const response = await createMcpProtectedRequestHandler(
        {
          issuer,
          audience: input.resource,
          jwksUrl: `${issuer}/jwks`,
          dpop: { replayStore: createDpopReplayStore(internalAdapter) },
        },
        async (webRequest, jwt) => {
          return mcpHttp.fetch(webRequest, {
            authInfo: mcpAuthInfoFromJwt(jwt, webRequest),
            parsedBody: req.body,
          });
        }
      )(request);
      await writeWebResponse(res, response);
    })().catch(next);
  };
}

interface McpExpressMount {
  post(path: string, handler: RequestHandler): unknown;
}

export function mountMcpHttp(input: {
  express: McpExpressMount;
  tools: readonly McpToolBinding[];
  /** Per-request discovery filter; direct composition may keep a static catalog. */
  listTools?: (caller: {
    userId: string;
    oauthClientId: string;
  }) => Promise<Result<readonly McpToolBinding[], ServerError>>;
  invoke: (payload: McpInvokeInput) => Promise<Result<unknown, ServerError>>;
  auth: BetterAuth;
  resource: string;
  /** Canonical Auth issuer; required when Better Auth uses a dynamic baseURL. */
  issuer?: string;
  serverName: string;
}): void {
  input.express.post(
    MCP_HTTP_PATH,
    createMcpExpressHandler({
      tools: input.tools,
      listTools: input.listTools,
      invoke: input.invoke,
      auth: input.auth,
      resource: input.resource,
      issuer: input.issuer,
      serverName: input.serverName,
    })
  );
}
