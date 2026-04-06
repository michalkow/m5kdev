import type { captureException } from "@sentry/node";
import { type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { camel } from "radashi";
import type { ServerErrorLayer } from "../modules/base/base.types";
import { logger } from "./logger";

export type { ServerErrorLayer };
export class ServerError extends Error {
  readonly code: TRPC_ERROR_CODE_KEY;
  readonly layer: ServerErrorLayer;
  readonly layerName: string;
  readonly clientMessage?: string;
  readonly context?: Record<string, unknown>;
  readonly boundaryStack?: string; // where we wrapped it

  constructor({
    code,
    layer,
    layerName,
    message,
    clientMessage,
    cause,
    context,
    captureBoundary = true,
  }: {
    code: TRPC_ERROR_CODE_KEY;
    layer?: ServerErrorLayer;
    layerName?: string;
    message?: string;
    clientMessage?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
    captureBoundary?: boolean;
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
    if (captureBoundary) this.boundaryStack = new Error().stack;

    Error.captureStackTrace?.(this, ServerError);
    Object.setPrototypeOf(this, new.target.prototype);
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
      cause: this.cause,
    });
  }

  toJSON() {
    return {
      code: this.code,
      layer: this.layer,
      layerName: this.layerName,
      message: this.message,
      context: this.context,
      stack: process.env.NODE_ENV !== "production" ? this.stack : undefined,
      boundaryStack: process.env.NODE_ENV !== "production" ? this.boundaryStack : undefined,
      // Shallow representation of cause to avoid cycles
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message, stack: this.cause.stack }
          : this.cause,
    };
  }

  static fromUnknown(
    code: TRPC_ERROR_CODE_KEY,
    cause: unknown,
    opts?: { layer?: ServerErrorLayer; layerName?: string; context?: Record<string, unknown> }
  ) {
    const msg = cause instanceof Error ? cause.message : undefined;
    return new ServerError({
      code,
      layer: opts?.layer,
      layerName: opts?.layerName,
      message: msg,
      cause,
      context: opts?.context,
      captureBoundary: true,
    });
  }
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
    // Merge - don't clobber caller-provided hint
    eventHint = {
      ...hint,
      extra: {
        ...((hint as any)?.extra ?? {}),
        layer: err.layer,
        layerName: err.layerName,
        code: err.code,
        message: err.message,
        clientMessage: err.clientMessage,
      },
    };
  }
  return reporter.captureException(err, eventHint);
}
