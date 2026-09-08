import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  E2E_MCP_CIMD_CLIENT_ID,
  E2E_MCP_CIMD_REDIRECT_URI,
} from "@m5kdev/backend/modules/auth/auth.mcp-e2e";
import {
  MCP_AUTH_ISSUER_PATH,
  MCP_AUTHORIZATION_SERVER_METADATA_PATH,
  MCP_HTTP_PATH,
  MCP_PROTECTED_RESOURCE_METADATA_PATH,
  mcpResourceUrl,
} from "@m5kdev/backend/modules/mcp/mcp.types";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const MCP_PROTOCOL_VERSION = "2026-07-28";

export interface McpOAuthDiscovery {
  resource: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

export interface McpOAuthSession {
  accessToken: string;
  redirectUri: string;
  close(): Promise<void>;
}

interface AuthorizationServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported: string[];
}

interface ProtectedResourceMetadata {
  resource?: string;
  scopes_supported: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Expected JSON from ${response.url}, received: ${text.slice(0, 300)}`);
  }
}

function parseAuthorizationServerMetadata(value: unknown): AuthorizationServerMetadata {
  if (!isRecord(value)) {
    throw new Error("Authorization server metadata was not an object");
  }
  const authorizationEndpoint = readString(value.authorization_endpoint);
  const tokenEndpoint = readString(value.token_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error("Authorization server metadata is missing endpoints");
  }
  return {
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    scopes_supported: readStringArray(value.scopes_supported),
  };
}

function parseProtectedResourceMetadata(value: unknown): ProtectedResourceMetadata {
  if (!isRecord(value)) {
    return { scopes_supported: [] };
  }
  return {
    resource: readString(value.resource),
    scopes_supported: readStringArray(value.scopes_supported),
  };
}

export async function discoverMcpOAuth(serverUrl: string): Promise<McpOAuthDiscovery> {
  const protectedResourceResponse = await fetch(
    `${serverUrl}${MCP_PROTECTED_RESOURCE_METADATA_PATH}/mcp`
  );
  const protectedResource = parseProtectedResourceMetadata(
    await readJson(protectedResourceResponse)
  );
  const authorizationServer = parseAuthorizationServerMetadata(
    await readJson(
      await fetch(`${serverUrl}${MCP_AUTHORIZATION_SERVER_METADATA_PATH}${MCP_AUTH_ISSUER_PATH}`)
    )
  );
  const resource = protectedResource.resource ?? mcpResourceUrl(serverUrl);
  const scopes =
    protectedResource.scopes_supported.length > 0
      ? protectedResource.scopes_supported
      : authorizationServer.scopes_supported.length > 0
        ? authorizationServer.scopes_supported
        : ["openid"];
  return {
    resource,
    authorizationEndpoint: authorizationServer.authorization_endpoint,
    tokenEndpoint: authorizationServer.token_endpoint,
    scopes,
  };
}

function startCallbackServer(): Promise<{
  redirectUri: string;
  waitForCode: Promise<string>;
  close: () => Promise<void>;
}> {
  return new Promise((resolveStart, rejectStart) => {
    let settleCode: ((code: string) => void) | undefined;
    let failCode: ((error: Error) => void) | undefined;
    const waitForCode = new Promise<string>((resolve, reject) => {
      settleCode = resolve;
      failCode = reject;
    });

    const server: Server = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", E2E_MCP_CIMD_REDIRECT_URI);
      if (requestUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/plain" });
      if (error) {
        const description = requestUrl.searchParams.get("error_description") ?? error;
        res.end(description);
        failCode?.(new Error(description));
        return;
      }
      if (!code) {
        res.end("missing code");
        failCode?.(new Error("OAuth callback did not include a code"));
        return;
      }
      res.end("ok");
      settleCode?.(code);
    });

    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectStart(new Error("OAuth callback server did not bind a port"));
        return;
      }
      resolveStart({
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        waitForCode,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      });
    });
  });
}

async function loginIfNeeded(page: Page, email: string, password: string): Promise<void> {
  const emailField = page.locator('[name="login-email"]');
  if (!(await emailField.isVisible().catch(() => false))) return;
  await emailField.fill(email);
  await page.locator('[name="login-password"]').fill(password);
  await page.getByRole("button", { name: /^login$/i }).click();
}

async function allowConsent(page: Page, organization: { id: string; name: string }): Promise<void> {
  await expect(
    page.getByText("Allow this MCP client"),
    `expected MCP consent page, at ${page.url()}`
  ).toBeVisible({ timeout: 20_000 });
  const orgRow = page.getByTestId(`mcp-consent-org-${organization.id}`);
  await expect(orgRow).toBeVisible({ timeout: 15_000 });
  const checkbox = orgRow.getByRole("checkbox");
  if (!(await checkbox.isChecked())) {
    await orgRow.locator('[data-slot="checkbox-control"]').click();
    await expect(checkbox).toBeChecked();
  }
  await page.getByTestId("mcp-consent-allow").click();
  await expect(page, `expected OAuth redirect after consent, at ${page.url()}`).not.toHaveURL(
    /\/consent(?:\?|$)/,
    { timeout: 20_000 }
  );
}

async function exchangeAuthorizationCode(input: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  verifier: string;
  resource: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: E2E_MCP_CIMD_CLIENT_ID,
    code_verifier: input.verifier,
    resource: input.resource,
  });
  const response = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readJson(response);
  if (!isRecord(payload)) {
    throw new Error("Token response was not an object");
  }
  const accessToken = readString(payload.access_token);
  if (!accessToken) {
    throw new Error(`Token response did not include access_token: ${JSON.stringify(payload)}`);
  }
  return accessToken;
}

export async function authorizeMcpClient(input: {
  page: Page;
  serverUrl: string;
  email: string;
  password: string;
  organization: { id: string; name: string };
}): Promise<McpOAuthSession> {
  const discovery = await discoverMcpOAuth(input.serverUrl);
  const { verifier, challenge } = pkce();
  const state = randomBytes(16).toString("hex");
  const callback = await startCallbackServer();
  const authorizeUrl = new URL(discovery.authorizationEndpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", E2E_MCP_CIMD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", callback.redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("resource", discovery.resource);
  authorizeUrl.searchParams.set("scope", "openid");

  try {
    await input.page.goto(authorizeUrl.toString());
    await expect(
      input.page.getByText("Allow this MCP client").or(input.page.locator('[name="login-email"]')),
      `expected consent or login after authorize, at ${input.page.url()}`
    ).toBeVisible({ timeout: 30_000 });
    await loginIfNeeded(input.page, input.email, input.password);
    await allowConsent(input.page, input.organization);
    const code = await callback.waitForCode;
    const accessToken = await exchangeAuthorizationCode({
      tokenEndpoint: discovery.tokenEndpoint,
      code,
      redirectUri: callback.redirectUri,
      verifier,
      resource: discovery.resource,
    });
    return {
      accessToken,
      redirectUri: callback.redirectUri,
      close: callback.close,
    };
  } catch (error) {
    await callback.close().catch(() => undefined);
    throw error;
  }
}

function parseSseJson(body: string): unknown {
  const dataLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  if (dataLines.length === 0) {
    throw new Error(`SSE body did not include data: ${body.slice(0, 300)}`);
  }
  return JSON.parse(dataLines.join("\n")) as unknown;
}

function unwrapJsonRpc(payload: unknown): unknown {
  if (!isRecord(payload)) {
    throw new Error(`MCP JSON-RPC payload was not an object: ${JSON.stringify(payload)}`);
  }
  if ("error" in payload) {
    throw new Error(`MCP JSON-RPC error: ${JSON.stringify(payload.error)}`);
  }
  if (!("result" in payload)) {
    throw new Error(`MCP JSON-RPC response missing result: ${JSON.stringify(payload)}`);
  }
  return payload.result;
}

function readToolText(result: unknown): { isError: boolean; text: string | undefined } {
  if (!isRecord(result)) {
    throw new Error(`MCP tool result was not an object: ${JSON.stringify(result)}`);
  }
  const content = result.content;
  const textEntry = Array.isArray(content)
    ? content.find(
        (entry) => isRecord(entry) && entry.type === "text" && typeof entry.text === "string"
      )
    : undefined;
  return {
    isError: result.isError === true,
    text: isRecord(textEntry) && typeof textEntry.text === "string" ? textEntry.text : undefined,
  };
}

async function readMcpJsonRpc(response: APIResponse): Promise<unknown> {
  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.statusText()}: ${text}`);
  }
  const contentType = response.headers()["content-type"] ?? "";
  if (contentType.includes("text/event-stream")) {
    return parseSseJson(text);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`MCP response was not JSON: ${text.slice(0, 300)}`);
  }
}

function mcpToolCallParams(input: {
  name: string;
  arguments?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    name: input.name,
    arguments: input.arguments ?? {},
    _meta: {
      "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": {
        name: "starter-e2e",
        version: "1.0.0",
      },
    },
  };
}

export async function callMcpTool(input: {
  request: APIRequestContext;
  serverUrl: string;
  accessToken: string;
  name: string;
  arguments?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await input.request.post(`${input.serverUrl}${MCP_HTTP_PATH}`, {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-method": "tools/call",
      "mcp-name": input.name,
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: mcpToolCallParams({ name: input.name, arguments: input.arguments }),
    },
  });
  const result = unwrapJsonRpc(await readMcpJsonRpc(response));
  const toolText = readToolText(result);
  if (toolText.isError) {
    throw new Error(toolText.text ?? `MCP call ${input.name} failed`);
  }
  if (toolText.text === undefined) {
    return result;
  }
  try {
    return JSON.parse(toolText.text) as unknown;
  } catch {
    return toolText.text;
  }
}

export { E2E_MCP_CIMD_CLIENT_ID, MCP_HTTP_PATH };
