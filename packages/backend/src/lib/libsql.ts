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
 *
 * Native bindings sometimes throw a plain `Error` with that message (or put it
 * on `.cause`) instead of `LibsqlError`. Duplicate `@libsql/client` copies can
 * also break `instanceof LibsqlError`. Match by code duck-typing + message.
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

const LIBSQL_RETRY_WRAPPED = Symbol.for("@m5kdev/backend.libsqlRetryWrapped");

type LibsqlRetryClient = Client & {
  [LIBSQL_RETRY_WRAPPED]?: true;
};

function errorMessageChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error ?? "");
  const parts = [error.message];
  let current: unknown = error.cause;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join("\n");
}

/** Prefer `LibsqlError.code`, then duck-type across duplicate package copies. */
export function getLibsqlErrorCode(error: unknown): string | undefined {
  if (error instanceof LibsqlError) return error.code;
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

export function isRetryableLibsqlError(error: unknown): boolean {
  const code = getLibsqlErrorCode(error);
  if (code && RETRYABLE_TRANSPORT_CODES.has(code)) return true;
  // Catch path only sees errors from libsql client methods — message match is enough
  // for plain `Error: Hrana(Api("...stream not found..."))` and duck-typed LibsqlError.
  return RETRYABLE_MESSAGE.test(errorMessageChain(error));
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
 *
 * Idempotent: wrapping an already-wrapped client returns it unchanged.
 */
export function withLibsqlRetry(client: Client, options: LibsqlRetryOptions = {}): Client {
  const existing = client as LibsqlRetryClient;
  if (existing[LIBSQL_RETRY_WRAPPED]) return client;

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
        const retryable = isRetryableLibsqlError(error);
        if (attempt >= maxRetries || !retryable) {
          if (retryable) {
            logger?.error(
              { err: error, method, attempts: attempt + 1, code: getLibsqlErrorCode(error) },
              "libsql call failed after hrana reconnect retries"
            );
          } else {
            // Always log — silence previously hid plain Error / duck-type misses.
            logger?.warn(
              { err: error, method, code: getLibsqlErrorCode(error) },
              "libsql call failed with non-retryable error"
            );
          }
          throw error;
        }
        logger?.warn(
          { err: error, method, attempt: attempt + 1, code: getLibsqlErrorCode(error) },
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

  const proxy = new Proxy(client, {
    get(target, prop) {
      if (prop === LIBSQL_RETRY_WRAPPED) return true;
      if (typeof prop === "string" && RETRIED_METHODS.has(prop)) {
        return (...args: unknown[]) => run(prop, args);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as LibsqlRetryClient;

  return proxy;
}
