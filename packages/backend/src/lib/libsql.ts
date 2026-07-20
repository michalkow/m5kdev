import { type Client, LibsqlError } from "@libsql/client";
import type { Logger } from "pino";

/**
 * Hrana streams are stateful: when the remote sqld/Turso node restarts or
 * expires an idle stream, the next request on the cached stream fails even
 * though a fresh attempt would succeed. These are the error shapes the client
 * surfaces for that situation.
 */
const RETRYABLE_CODES = new Set([
  "HRANA_WEBSOCKET_ERROR",
  "HRANA_PROTO_ERROR",
  "HRANA_CLOSED_ERROR",
  "WEBSOCKET_ERROR",
]);

const RETRYABLE_SERVER_MESSAGE = /\bstream\b.*\b(?:not found|expired|closed)|baton|status 404/i;

export function isRetryableLibsqlError(error: unknown): boolean {
  if (!(error instanceof LibsqlError)) return false;
  if (RETRYABLE_CODES.has(error.code)) return true;
  return error.code === "SERVER_ERROR" && RETRYABLE_SERVER_MESSAGE.test(error.message);
}

export type LibsqlRetryOptions = {
  /** Retries per call after the initial attempt. */
  maxRetries?: number;
  /** Base backoff, doubled per retry. */
  backoffMs?: number;
  logger?: Logger;
};

const RETRIED_METHODS = new Set([
  "execute",
  "batch",
  "migrate",
  "executeMultiple",
  "sync",
  "transaction",
]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a libsql {@link Client} so top-level calls recover from dead hrana
 * streams by reconnecting and retrying. Only the `transaction()` open is
 * retried — statements inside an interactive transaction must bubble, since
 * replaying half a transaction is not safe.
 */
export function withLibsqlRetry(client: Client, options: LibsqlRetryOptions = {}): Client {
  const maxRetries = options.maxRetries ?? 2;
  const backoffMs = options.backoffMs ?? 100;
  const logger = options.logger;

  const run = async (method: string, args: unknown[]): Promise<unknown> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await (client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
          method
        ](...args);
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableLibsqlError(error)) throw error;
        logger?.warn(
          { err: error, method, attempt: attempt + 1 },
          "libsql call failed on a dead hrana stream; reconnecting and retrying"
        );
        try {
          client.reconnect();
        } catch {
          // reconnect is best-effort; the retry below reports the real failure
        }
        await delay(backoffMs * 2 ** attempt);
      }
    }
  };

  return new Proxy(client, {
    get(target, prop) {
      if (typeof prop === "string" && RETRIED_METHODS.has(prop)) {
        return (...args: unknown[]) => run(prop, args);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
