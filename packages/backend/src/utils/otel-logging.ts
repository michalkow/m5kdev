import { context, isSpanContextValid, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

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

export function getOtelLogMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const spanContext = span.spanContext();
  if (!isSpanContextValid(spanContext)) return {};
  return {
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

  const otelLogger = logs.getLogger(LOGGER_NAME);
  otelLogger.emit({
    severityNumber: PINO_LEVEL_TO_SEVERITY[level] ?? SeverityNumber.UNSPECIFIED,
    body: message ?? "",
    attributes: toOtelLogAttributes(mergeObject),
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
