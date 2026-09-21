import type { Express, NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger as rootLogger } from "../../utils/logger";
import type { McpDcrRestoreStore } from "./auth.mcp-dcr.repository";

const NATIVE_LOOPBACK_PLACEHOLDER = "http://127.0.0.1/cursor-mcp-callback";

export interface McpDcrRedirectRewrite {
  applicationType: "native";
  readonly registrationUris: readonly string[];
  readonly restoredUris: readonly string[];
  softwareId: string;
}

/**
 * Cursor's MCP DCR omits `application_type` (OIDC default: web) and sends
 * `cursor://…` plus https/localhost. Better Auth 1.7.3 treats that as a web
 * client and rejects non-HTTPS redirects (better-auth#10956).
 *
 * Rewrite as native with only http(s) redirects so registration succeeds;
 * restore original URIs (including custom schemes) after a 201.
 */
export function isCustomSchemeRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol !== "http:" && url.protocol !== "https:";
  } catch {
    return false;
  }
}

export function rewriteMcpDcrRedirects(input: {
  redirectUris: readonly string[];
  softwareId?: string;
}): McpDcrRedirectRewrite | null {
  const customUris = input.redirectUris.filter(isCustomSchemeRedirectUri);
  if (customUris.length === 0) {
    return null;
  }

  const httpUris = input.redirectUris.filter((uri) => !isCustomSchemeRedirectUri(uri));
  const registrationUris = httpUris.length > 0 ? [...httpUris] : [NATIVE_LOOPBACK_PLACEHOLDER];
  const restoredUris = httpUris.length > 0 ? [...httpUris, ...customUris] : [...customUris];
  const softwareId =
    typeof input.softwareId === "string" && input.softwareId.length > 0
      ? input.softwareId
      : `cursor-mcp-${uuidv4()}`;

  return {
    applicationType: "native",
    registrationUris,
    restoredUris,
    softwareId,
  };
}

export function mountMcpDcrNativeClientInterop(input: {
  app: Express;
  store: McpDcrRestoreStore | null;
}): void {
  const logger = rootLogger.child({ layer: "mcpDcr" });

  input.app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    const path = (req.path.replace(/\/+$/, "") || "/").toLowerCase();
    if (!path.endsWith("/oauth2/register")) {
      next();
      return;
    }

    const body = jsonObject(req.body);
    const redirectUris = readRedirectUris(body);
    const rewrite = rewriteMcpDcrRedirects({
      redirectUris,
      softwareId: typeof body?.software_id === "string" ? body.software_id : undefined,
    });
    if (!body || !rewrite) {
      next();
      return;
    }

    body.application_type = rewrite.applicationType;
    body.redirect_uris = [...rewrite.registrationUris];
    body.software_id = rewrite.softwareId;

    holdResponseUntil({
      res,
      beforeFlush: async (statusCode) => {
        if (statusCode !== 201 || !input.store) {
          return;
        }

        try {
          await input.store.restoreClientRedirectUrisBySoftwareId({
            softwareId: rewrite.softwareId,
            redirectUris: rewrite.restoredUris,
          });
          logger.info(
            { softwareId: rewrite.softwareId, redirectUris: rewrite.restoredUris },
            "Restored MCP native redirect URIs after DCR"
          );
        } catch (error) {
          logger.error(
            { error, softwareId: rewrite.softwareId },
            "Failed to restore MCP redirect URIs after DCR"
          );
        }
      },
    });

    next();
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return isJsonObject(value) ? value : undefined;
}

function readRedirectUris(body: Record<string, unknown> | undefined): string[] {
  if (!body || !Array.isArray(body.redirect_uris)) {
    return [];
  }

  return body.redirect_uris.filter((uri): uri is string => typeof uri === "string");
}

function holdResponseUntil(input: {
  res: Response;
  beforeFlush: (statusCode: number) => Promise<void>;
}): void {
  const originalWrite = input.res.write.bind(input.res);
  const originalEnd = input.res.end.bind(input.res);
  const chunks: Buffer[] = [];
  let finalized = false;

  input.res.write = ((chunk?: unknown, encodingOrCb?: unknown, cb?: unknown) => {
    appendChunk({ chunks, chunk, encodingOrCb });
    invokeOptionalCallback({ encodingOrCb, cb });
    return true;
  }) as Response["write"];

  input.res.end = ((chunk?: unknown, encodingOrCb?: unknown, cb?: unknown) => {
    if (finalized) {
      return input.res;
    }
    finalized = true;
    appendChunk({ chunks, chunk, encodingOrCb });

    void input
      .beforeFlush(input.res.statusCode)
      .catch((error: unknown) => {
        rootLogger.error({ error }, "MCP DCR response hold failed");
      })
      .finally(() => {
        const out = Buffer.concat(chunks);
        originalWrite(out);
        originalEnd();
        invokeOptionalCallback({ encodingOrCb, cb });
      });

    return input.res;
  }) as Response["end"];
}

function appendChunk(input: { chunks: Buffer[]; chunk: unknown; encodingOrCb: unknown }): void {
  const buffer = chunkToBuffer(input);
  if (buffer) {
    input.chunks.push(buffer);
  }
}

function chunkToBuffer(input: { chunk: unknown; encodingOrCb: unknown }): Buffer | null {
  const { chunk, encodingOrCb } = input;
  if (chunk === undefined || chunk === null || typeof chunk === "function") {
    return null;
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  if (typeof chunk === "string") {
    const encoding = isBufferEncoding(encodingOrCb) ? encodingOrCb : "utf8";
    return Buffer.from(chunk, encoding);
  }

  return null;
}

function isBufferEncoding(value: unknown): value is BufferEncoding {
  return typeof value === "string" && Buffer.isEncoding(value);
}

function invokeOptionalCallback(input: { encodingOrCb: unknown; cb: unknown }): void {
  if (typeof input.encodingOrCb === "function") {
    input.encodingOrCb();
    return;
  }
  if (typeof input.cb === "function") {
    input.cb();
  }
}
