import type { captureException } from "@sentry/node";
import { type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { camel } from "radashi";
import type { ServerErrorLayer } from "../modules/base/base.types";
import { logger } from "./logger";
import { extractOrigin, trimStack } from "./stack";

export type { ServerErrorLayer };
export class ServerError extends Error {
  readonly code: TRPC_ERROR_CODE_KEY;
  readonly layer: ServerErrorLayer;
  readonly layerName: string;
  readonly clientMessage?: string;
  context?: Record<string, unknown>;
  origin?: string;
  /** Set by captureServerError: the error has been logged (and reported when 5xx). */
  logged = false;
  sentryEventId?: string;

  constructor({
    code,
    layer,
    layerName,
    message,
    clientMessage,
    cause,
    context,
  }: {
    code: TRPC_ERROR_CODE_KEY;
    layer?: ServerErrorLayer;
    layerName?: string;
    message?: string;
    clientMessage?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    // keep native cause chain when the cause is an Error
    super(message ?? `server.error.${layer}.${camel(code)}`, {
      cause: cause instanceof Error ? cause : undefined,
    });

    this.code = code;
    this.layer = layer ?? "unknown";
    this.layerName = layerName ?? "UnknownLayer";
    this.clientMessage = clientMessage ?? `server.error.${layer}.${camel(code)}`;
    this.context = context;

    Error.captureStackTrace?.(this, ServerError);
    this.refreshOrigin();
    Object.setPrototypeOf(this, new.target.prototype);
  }

  refreshOrigin(): void {
    this.origin = extractOrigin(this.stack);
  }

  addContext(context: Record<string, unknown>): void {
    this.context = { ...(this.context ?? {}), ...context };
  }

  is5xxError(): boolean {
    const statusCode = this.getHTTPStatusCode();
    return statusCode >= 500 && statusCode < 600;
  }

  getHTTPStatusCode(): number {
    return getHTTPStatusCodeFromError(this.toTRPC());
  }

  toTRPC(): TRPCError {
    return new TRPCError({
      code: this.code,
      message: this.message,
      // keep `this` in the chain so transport boundaries can recognize
      // an already-captured ServerError (this.cause stays reachable below it)
      cause: this,
    });
  }

  toJSON() {
    return {
      code: this.code,
      layer: this.layer,
      layerName: this.layerName,
      message: this.message,
      origin: this.origin,
      context: this.context,
      sentryEventId: this.sentryEventId,
      stack: trimStack(this.stack),
      // Shallow representation of cause to avoid cycles
      cause:
        this.cause instanceof Error
          ? {
              name: this.cause.name,
              message: this.cause.message,
              stack: trimStack(this.cause.stack),
            }
          : this.cause,
    };
  }

  static fromUnknown(
    code: TRPC_ERROR_CODE_KEY,
    cause: unknown,
    opts?: { layer?: ServerErrorLayer; layerName?: string; context?: Record<string, unknown> }
  ) {
    const msg = cause instanceof Error ? cause.message : undefined;
    const serverError = new ServerError({
      code,
      layer: opts?.layer,
      layerName: opts?.layerName,
      message: msg,
      cause,
      context: opts?.context,
    });
    // the wrapper call site is plumbing — point origin at where the cause was thrown
    if (cause instanceof Error) {
      serverError.origin = extractOrigin(cause.stack) ?? serverError.origin;
    }
    return serverError;
  }
}

type CaptureLogger = Pick<typeof logger, "error" | "warn" | "debug">;

/**
 * Terminal capture point for a ServerError: report to Sentry when 5xx and log once.
 * Safe to call from multiple places — subsequent calls are no-ops (`logged` guard),
 * so errors are captured where they happen and boundaries only echo.
 */
export function captureServerError(
  error: ServerError,
  {
    logger: log = logger,
    level,
  }: { logger?: CaptureLogger; level?: "error" | "warn" | "debug" } = {}
): ServerError {
  if (error.logged) return error;
  error.logged = true;

  const critical = error.is5xxError();
  if (critical) {
    error.sentryEventId = reportError(error);
  }

  // code/layerName/origin drive the pretty message line (and are ignored as keys)
  const fields = {
    code: error.code,
    layer: error.layer,
    layerName: error.layerName,
    origin: error.origin,
  };
  const logLevel = level ?? (critical ? "error" : "warn");
  if (critical) {
    // err carries trimmed stack, context, and sentryEventId via the err serializer
    log[logLevel]({ ...fields, err: error }, error.message);
  } else {
    // expected failure: one line, no stack
    log[logLevel]({ ...fields, context: error.context }, error.message);
  }
  return error;
}

export type ErrorReporter = {
  captureException: (
    err: Parameters<typeof captureException>[0],
    hint?: Parameters<typeof captureException>[1]
  ) => string;
};
declare global {
  // eslint-disable-next-line no-var
  var m5ErrorReporter: ErrorReporter | undefined;
}

export function getErrorReporter(): ErrorReporter | undefined {
  return globalThis.m5ErrorReporter;
}

export function setErrorReporter(reporter: ErrorReporter) {
  globalThis.m5ErrorReporter = reporter;
}

export function reportError(
  err: ServerError | Error | unknown,
  hint?: Parameters<typeof captureException>[1]
): string | undefined {
  let eventHint = hint;
  const reporter = getErrorReporter();
  if (!reporter) {
    logger.error("[reportError] No error reporter set!");
    return;
  }
  if (err instanceof ServerError) {
    const hintExtra = (hint as { extra?: Record<string, unknown> } | undefined)?.extra;
    // Merge - don't clobber caller-provided hint
    eventHint = {
      ...hint,
      extra: {
        ...(hintExtra ?? {}),
        layer: err.layer,
        layerName: err.layerName,
        code: err.code,
        message: err.message,
        clientMessage: err.clientMessage,
        origin: err.origin,
        context: err.context,
      },
    } as Parameters<typeof captureException>[1];
  }
  return reporter.captureException(err, eventHint);
}
