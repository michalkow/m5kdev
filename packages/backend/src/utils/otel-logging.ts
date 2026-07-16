import { context, isSpanContextValid, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getActorTelemetrySpanAttributes } from "./telemetry";

const LOGGER_NAME = "@m5kdev/backend";
const MAX_LOG_ATTRIBUTE_LENGTH = 4096;

const PINO_LEVEL_TO_SEVERITY: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
};

const BODY_HINT_KEYS = ["body", "label", "msg", "message"] as const;

function serializeLogAttribute(value: unknown): string {
  if (value === undefined) return "";
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_LOG_ATTRIBUTE_LENGTH) return serialized;
    return `${serialized.slice(0, MAX_LOG_ATTRIBUTE_LENGTH)}…[truncated]`;
  } catch {
    return "[unserializable]";
  }
}

function readErrorMessage(value: unknown): string | undefined {
  if (value instanceof Error) return value.message;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function formatPrimitiveLogBody(mergeObject: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(mergeObject)) {
    if (value === undefined || value === null) continue;
    if (key === "err" || key === "error") {
      const message = readErrorMessage(value);
      if (message) parts.push(`${key}=${message}`);
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${String(value)}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function formatLogBody(
  mergeObject: Record<string, unknown>,
  message?: string
): string {
  if (message) return message;

  for (const key of BODY_HINT_KEYS) {
    const value = mergeObject[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  const errorMessage =
    readErrorMessage(mergeObject.err) ?? readErrorMessage(mergeObject.error);
  if (errorMessage) return errorMessage;

  const primitiveBody = formatPrimitiveLogBody(mergeObject);
  if (primitiveBody) return primitiveBody;

  return serializeLogAttribute(mergeObject);
}

export function getOtelLogMixin(): Record<string, string> {
  const actorAttributes = getActorTelemetrySpanAttributes();
  const span = trace.getSpan(context.active());
  if (!span) return actorAttributes;
  const spanContext = span.spanContext();
  if (!isSpanContextValid(spanContext)) return actorAttributes;
  return {
    ...actorAttributes,
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: `0${spanContext.traceFlags.toString(16)}`,
  };
}

function toOtelLogAttributes(
  mergeObject: Record<string, unknown>
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(mergeObject)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      attributes[key] = value;
      continue;
    }
    attributes[key] = serializeLogAttribute(value);
  }
  return attributes;
}

export function emitOtelLogRecord(
  level: number,
  mergeObject: Record<string, unknown>,
  message?: string
): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_SDK_DISABLED === "true") {
    return;
  }

  const body = formatLogBody(mergeObject, message);
  const otelLogger = logs.getLogger(LOGGER_NAME);
  otelLogger.emit({
    severityNumber: PINO_LEVEL_TO_SEVERITY[level] ?? SeverityNumber.UNSPECIFIED,
    body,
    attributes: toOtelLogAttributes({ ...mergeObject, body }),
    context: context.active(),
  });
}

export function parsePinoLogArgs(
  args: unknown[]
): { mergeObject: Record<string, unknown>; message?: string } {
  if (args.length === 0) return { mergeObject: {} };
  if (typeof args[0] === "string") return { mergeObject: {}, message: args[0] };
  const mergeObject =
    typeof args[0] === "object" && args[0] !== null
      ? (args[0] as Record<string, unknown>)
      : { value: args[0] };
  const message = typeof args[1] === "string" ? args[1] : undefined;
  return { mergeObject, message };
}

/** Ensures object-only logs get a readable `body` field and pino `msg` string. */
export function enrichPinoLogArgs(args: unknown[]): unknown[] {
  if (args.length === 0) return args;
  if (typeof args[0] === "string") return args;

  const mergeObject =
    typeof args[0] === "object" && args[0] !== null
      ? (args[0] as Record<string, unknown>)
      : { value: args[0] };
  const message = typeof args[1] === "string" ? args[1] : undefined;
  const body = formatLogBody(mergeObject, message);

  const enrichedObject =
    typeof mergeObject.body === "string" && mergeObject.body.length > 0
      ? mergeObject
      : { ...mergeObject, body };

  if (message) return [enrichedObject, message, ...args.slice(2)];
  return [enrichedObject, body, ...args.slice(1)];
}
