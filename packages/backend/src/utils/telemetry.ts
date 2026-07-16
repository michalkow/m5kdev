import { type Span, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import type { Result } from "neverthrow";
import type { ServerError } from "./errors";

const TRACER_NAME = "@m5kdev/backend";
const MAX_SPAN_VALUE_LENGTH = 4096;

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

export function serializeSpanValue(value: unknown): string {
  if (value === undefined) return "";
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_SPAN_VALUE_LENGTH) return serialized;
    return `${serialized.slice(0, MAX_SPAN_VALUE_LENGTH)}…[truncated]`;
  } catch {
    return "[unserializable]";
  }
}

function isServerResult<T>(value: unknown): value is Result<T, ServerError> {
  return (
    typeof value === "object" &&
    value !== null &&
    "isErr" in value &&
    typeof (value as { isErr: unknown }).isErr === "function" &&
    "isOk" in value &&
    typeof (value as { isOk: unknown }).isOk === "function"
  );
}

function recordServerErrorOnSpan(span: Span, error: ServerError): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  span.setAttribute("error.code", error.code);
  span.setAttribute("error.layer", error.layer);
  span.setAttribute("error.layerName", error.layerName);
  span.recordException(error);
}

function recordExceptionOnSpan(span: Span, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message,
  });
  if (error instanceof Error) {
    span.recordException(error);
  }
}

function recordSpanSuccess(span: Span, value: unknown): void {
  span.setAttribute("output", serializeSpanValue(value));
  span.setStatus({ code: SpanStatusCode.OK });
}

function finalizeSpanResult<T>(span: Span, result: T): T {
  if (isServerResult(result)) {
    if (result.isErr()) {
      recordServerErrorOnSpan(span, result.error);
    } else {
      recordSpanSuccess(span, result.value);
    }
  } else {
    recordSpanSuccess(span, result);
  }
  span.end();
  return result;
}

export async function withSpan<T>(
  options: {
    name: string;
    attributes?: Record<string, string | number | boolean>;
  },
  fn: (span: Span) => Promise<T> | T
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(options.name, { attributes: options.attributes }, async (span) => {
    try {
      const result = await fn(span);
      return finalizeSpanResult(span, result);
    } catch (error) {
      recordExceptionOnSpan(span, error);
      span.end();
      throw error;
    }
  });
}
