import { isSpanContextValid, SpanStatusCode, trace } from "@opentelemetry/api";
import { type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { camel } from "radashi";
import type { ServerErrorLayer } from "../modules/base/base.types";
import { logger } from "./logger";
import { extractOrigin, trimStack } from "./stack";
import { getActorTelemetrySpanAttributes } from "./telemetry";

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
  errorEventId?: string;

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
      errorEventId: this.errorEventId,
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
 * Terminal capture point for a ServerError: report to PostHog when 5xx and log once.
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
    error.errorEventId = reportError(error);
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
    // err carries trimmed stack, context, and errorEventId via the err serializer
    log[logLevel]({ ...fields, err: error }, error.message);
  } else {
    // expected failure: one line, no stack
    log[logLevel]({ ...fields, context: error.context }, error.message);
  }
  return error;
}

export type ErrorProperties = Record<string, unknown>;

export type ErrorReporter = {
  captureException: (error: unknown, properties?: ErrorProperties) => string | undefined;
};

declare global {
  // eslint-disable-next-line no-var
  var m5ErrorReporter: ErrorReporter | undefined;
}

export function getErrorReporter(): ErrorReporter | undefined {
  return globalThis.m5ErrorReporter;
}

export function setErrorReporter(reporter: ErrorReporter | undefined) {
  globalThis.m5ErrorReporter = reporter;
}

/**
 * Flatten `error.cause` messages for span attributes / status text.
 * PostHog walks the cause chain; SigNoz span status/events do not unless we attach them.
 */
export function formatErrorCauseChain(error: Error, maxDepth = 5): string | undefined {
  const parts: string[] = [];
  let current: unknown = error.cause;
  for (let depth = 0; depth < maxDepth && current instanceof Error; depth++) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.length > 0 ? parts.join(" ← ") : undefined;
}

function rootErrorCause(error: Error, maxDepth = 5): Error {
  let current = error;
  for (let depth = 0; depth < maxDepth && current.cause instanceof Error; depth++) {
    current = current.cause;
  }
  return current;
}

/** Annotate the active OTel span with ServerError fields + underlying cause (for SigNoz). */
export function annotateSpanWithError(
  span: NonNullable<ReturnType<typeof trace.getActiveSpan>>,
  err: ServerError | Error | unknown
): void {
  if (err instanceof ServerError) {
    const causeChain = formatErrorCauseChain(err);
    const statusMessage = causeChain ? `${err.message}: ${causeChain}` : err.message;
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: statusMessage,
    });
    span.setAttribute("error.code", err.code);
    span.setAttribute("error.layer", err.layer);
    span.setAttribute("error.layerName", err.layerName);
    if (causeChain) {
      span.setAttribute("error.cause", causeChain);
    }
    // Record the deepest cause so exception.message matches what PostHog shows.
    span.recordException(rootErrorCause(err));
    return;
  }

  if (err instanceof Error) {
    const causeChain = formatErrorCauseChain(err);
    const statusMessage = causeChain ? `${err.message}: ${causeChain}` : err.message;
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: statusMessage,
    });
    if (causeChain) {
      span.setAttribute("error.cause", causeChain);
    }
    span.recordException(rootErrorCause(err));
    return;
  }

  const message = typeof err === "string" ? err : "Unknown error";
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message,
  });
  span.recordException(new Error(message));
}

function recordErrorOnActiveSpan(err: ServerError | Error | unknown): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  annotateSpanWithError(span, err);
}

export function reportError(error: unknown, properties: ErrorProperties = {}): string | undefined {
  // OTel annotations must survive an unconfigured or unavailable error destination.
  recordErrorOnActiveSpan(error);
  const reporter = getErrorReporter();
  if (!reporter) return undefined;

  const spanContext = trace.getActiveSpan()?.spanContext();
  const context = {
    ...properties,
    ...(error instanceof ServerError
      ? {
          layer: error.layer,
          layerName: error.layerName,
          code: error.code,
          message: error.message,
          clientMessage: error.clientMessage,
          origin: error.origin,
          context: error.context,
        }
      : {}),
    ...getActorTelemetrySpanAttributes(),
    ...(spanContext && isSpanContextValid(spanContext)
      ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
      : {}),
  };
  try {
    return reporter.captureException(error, context);
  } catch (captureError) {
    logger.warn({ err: captureError }, "Error reporting failed");
    return undefined;
  }
}
