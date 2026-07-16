import pino from "pino";
import {
  emitOtelLogRecord,
  enrichPinoLogArgs,
  getOtelLogMixin,
  parsePinoLogArgs,
} from "./otel-logging";
import { trimStack } from "./stack";

// OTel log correlation (trace_id/span_id) and OTLP export are wired here so they
// work under ESM/tsx. initTelemetry() must run before this module is first imported.
const isProduction = process.env.NODE_ENV === "production";
const otelLogsEnabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

type ErrorLike = Error & {
  code?: string;
  layer?: string;
  layerName?: string;
  origin?: string;
  context?: Record<string, unknown>;
  clientMessage?: string;
  sentryEventId?: string;
};

/**
 * Serializer for the `err` key. Duck-typed against ServerError (no import to
 * avoid a cycle with errors.ts). Stacks are trimmed for logs — Sentry receives
 * the real exception object with the full stack via reportError.
 */
function errSerializer(err: unknown) {
  if (!(err instanceof Error)) return err;
  const e = err as ErrorLike;
  return {
    type: e.name,
    message: e.message,
    stack: trimStack(e.stack),
    ...(e.code ? { code: e.code } : {}),
    ...(e.layer ? { layer: e.layer } : {}),
    ...(e.layerName ? { layerName: e.layerName } : {}),
    ...(e.origin ? { origin: e.origin } : {}),
    ...(e.context ? { context: e.context } : {}),
    ...(e.sentryEventId ? { sentryEventId: e.sentryEventId } : {}),
    ...(e.cause instanceof Error
      ? { cause: { type: e.cause.name, message: e.cause.message, stack: trimStack(e.cause.stack) } }
      : e.cause !== undefined
        ? { cause: e.cause }
        : {}),
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "debug",
  serializers: { err: errSerializer },
  mixin: () => getOtelLogMixin(),
  hooks: {
    logMethod(inputArgs, method, level) {
      const enrichedArgs = enrichPinoLogArgs(inputArgs);
      if (otelLogsEnabled) {
        const { mergeObject, message } = parsePinoLogArgs(enrichedArgs);
        emitOtelLogRecord(level, mergeObject, message);
      }
      return method.apply(this, enrichedArgs);
    },
  },
  // Pretty console in dev; raw structured JSON in production (full data for
  // log aggregation, no pino-pretty on the hot path).
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            // one readable line per entry: [Layer] CODE message → origin
            messageFormat:
              "{if layerName}[{layerName}] {end}{if code}{code} {end}{msg}{if origin} → {origin}{end}",
            // these keys are already rendered in the message line
            ignore: "pid,hostname,layer,layerName,code,origin,body,trace_id,span_id,trace_flags,user.id,organization.id",
          },
        },
      }),
});
