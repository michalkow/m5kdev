import { type Client, LibsqlError } from "@libsql/client";
import type { Logger } from "pino";

/**
 * Hrana streams are stateful: when the remote sqld/Turso node restarts or
 * expires an idle stream, the next request on the cached stream fails even
 * though a fresh attempt would succeed.
 *
 * Remote (ws/http) clients usually use HRANA_* / SERVER_ERROR codes. Embedded
 * replicas go through the native sqlite3 binding and surface the same failure
 * as SQLITE_* with a Rust Debug message like
 * `Hrana(Api("status=404 Not Found, body={\"error\":\"stream not found: ...\"}"))`.
 */
const RETRYABLE_TRANSPORT_CODES = new Set([
  "HRANA_WEBSOCKET_ERROR",
  "HRANA_PROTO_ERROR",
  "HRANA_CLOSED_ERROR",
  "WEBSOCKET_ERROR",
]);

/**
 * Message shapes shared by SERVER_ERROR (remote) and SQLITE_* (embedded replica)
 * failures for dead/expired hrana streams. `[\s\S]*` spans the Rust Debug wrapper
 * around JSON bodies (`Hrana(Api("...stream not found..."))`).
 */
const RETRYABLE_MESSAGE =
  /\bstream\b[\s\S]*\b(?:not found|expired|closed)|\binvalid baton\b|\bbaton\b|status[= ]404/i;

function libsqlErrorMessage(error: LibsqlError): string {
  const parts = [error.message];
  if (error.cause instanceof Error) parts.push(error.cause.message);
  return parts.join("\n");
}

export function isRetryableLibsqlError(error: unknown): boolean {
  if (!(error instanceof LibsqlError)) return false;
  if (RETRYABLE_TRANSPORT_CODES.has(error.code)) return true;
  // SERVER_ERROR / SQLITE_* / UNKNOWN — only retry when the message is a dead stream.
  return RETRYABLE_MESSAGE.test(libsqlErrorMessage(error));
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
