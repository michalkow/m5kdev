import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage } from "node:http";
import { type Span, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import type { Result } from "neverthrow";
import type { ServerError } from "./errors";

const TRACER_NAME = "@m5kdev/backend";
const MAX_SPAN_VALUE_LENGTH = 4096;
const TRPC_PATHS_KEY = Symbol.for("@m5kdev/backend.trpc.paths");

type RequestWithTrpcPaths = IncomingMessage & {
  [TRPC_PATHS_KEY]?: string[];
};

export interface ActorTelemetry {
  userId?: string;
  organizationId?: string;
}

export interface ActorTelemetryRequestContext {
  user?: { id?: string } | null;
  session?: { activeOrganizationId?: string | null } | null;
  actor?: { organizationId?: string | null } | null;
}

const actorTelemetryStorage = new AsyncLocalStorage<ActorTelemetry>();

function mergeActorTelemetry(
  parent: ActorTelemetry | undefined,
  attrs: ActorTelemetry
): ActorTelemetry {
  return {
    userId: attrs.userId ?? parent?.userId,
    organizationId: attrs.organizationId ?? parent?.organizationId,
  };
}

function applyActorTelemetryToSpan(span: Span, telemetry: ActorTelemetry): void {
  if (telemetry.userId) span.setAttribute("user.id", telemetry.userId);
  if (telemetry.organizationId) span.setAttribute("organization.id", telemetry.organizationId);
}

export function getActorTelemetrySpanAttributes(): Record<string, string> {
  const telemetry = actorTelemetryStorage.getStore();
  if (!telemetry) return {};
  const attributes: Record<string, string> = {};
  if (telemetry.userId) attributes["user.id"] = telemetry.userId;
  if (telemetry.organizationId) attributes["organization.id"] = telemetry.organizationId;
  return attributes;
}

export function actorTelemetryFromRequestContext(
  ctx: ActorTelemetryRequestContext
): ActorTelemetry {
  const userId = ctx.user?.id;
  const organizationId =
    ctx.actor?.organizationId ?? ctx.session?.activeOrganizationId ?? undefined;
  return {
    ...(userId ? { userId } : {}),
    ...(organizationId ? { organizationId } : {}),
  };
}

export function actorTelemetryFromJobData(data: unknown): ActorTelemetry {
  if (!data || typeof data !== "object") return {};
  const record = data as Record<string, unknown>;
  const userId = typeof record.userId === "string" ? record.userId : undefined;
  const organizationId =
    typeof record.organizationId === "string" ? record.organizationId : undefined;
  return {
    ...(userId ? { userId } : {}),
    ...(organizationId ? { organizationId } : {}),
  };
}

export function runWithActorTelemetry<T>(attrs: ActorTelemetry, callback: () => T): T {
  const merged = mergeActorTelemetry(actorTelemetryStorage.getStore(), attrs);
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) applyActorTelemetryToSpan(activeSpan, merged);
  return actorTelemetryStorage.run(merged, callback);
}
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Records a tRPC procedure path on the incoming HTTP request so the HTTP root
 * span can be renamed after Express/HTTP instrumentation settles the route.
 * Paths are already `router.procedure` (or nested) from tRPC.
 */
export function attachTrpcPathToRequest(
  req: IncomingMessage | undefined,
  path: string | undefined
): void {
  if (!req || !path) return;
  const carrier = req as RequestWithTrpcPaths;
  const existing = carrier[TRPC_PATHS_KEY];
  if (!existing) {
    carrier[TRPC_PATHS_KEY] = [path];
    return;
  }
  if (!existing.includes(path)) {
    existing.push(path);
  }
}

export function getTrpcPathsFromRequest(req: IncomingMessage | undefined): string[] {
  if (!req) return [];
  return (req as RequestWithTrpcPaths)[TRPC_PATHS_KEY] ?? [];
}

/** HTTP root span label: `trpc.router.procedure` or comma-joined for batches. */
export function formatTrpcHttpSpanName(paths: readonly string[]): string | undefined {
  if (paths.length === 0) return undefined;
  if (paths.length === 1) return `trpc.${paths[0]}`;
  return `trpc.${paths.join(",")}`;
}

/**
 * Renames the HTTP server span when tRPC procedure path(s) were attached to the
 * request. Intended for HttpInstrumentation `applyCustomAttributesOnSpan`.
 */
export function applyTrpcAttributesOnHttpSpan(
  span: Span,
  request: IncomingMessage | unknown
): void {
  if (!request || typeof request !== "object") return;
  const paths = getTrpcPathsFromRequest(request as IncomingMessage);
  const name = formatTrpcHttpSpanName(paths);
  if (!name) return;

  span.updateName(name);
  span.setAttribute("rpc.system", "trpc");
  span.setAttribute("trpc.path", paths.join(","));
  const [singlePath] = paths;
  if (paths.length === 1 && singlePath) {
    span.setAttribute("rpc.method", singlePath);
  } else {
    span.setAttribute("rpc.method", "batch");
    span.setAttribute("trpc.batch", true);
  }
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
  const attributes = {
    ...getActorTelemetrySpanAttributes(),
    ...options.attributes,
  };
  return tracer.startActiveSpan(options.name, { attributes }, async (span) => {
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
