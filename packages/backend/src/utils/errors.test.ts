import { SpanStatusCode, trace } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { registerTestTracerProvider, shutdownTestTracerProvider } from "../test/stubs/otel";
import {
  captureServerError,
  type ErrorReporter,
  reportError,
  ServerError,
  setErrorReporter,
} from "./errors";
import { runWithPosthogRequestState } from "./posthog";
import { runWithActorTelemetry } from "./telemetry";

describe("reportError otel", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let previousReporter: ErrorReporter | undefined;

  beforeEach(() => {
    previousReporter = globalThis.m5ErrorReporter;
    exporter = new InMemorySpanExporter();
    provider = registerTestTracerProvider(exporter);
    setErrorReporter({
      captureException: () => "error-event-id",
    });
  });

  afterEach(async () => {
    globalThis.m5ErrorReporter = previousReporter;
    await shutdownTestTracerProvider(provider, exporter);
  });

  it("records ServerError exception on the active span next to PostHog", async () => {
    const error = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      layer: "service",
      layerName: "ExampleService",
      message: "boom",
    });

    const tracer = trace.getTracer("errors.test");
    await tracer.startActiveSpan("report-error", async (span) => {
      const eventId = reportError(error);
      expect(eventId).toBe("error-event-id");
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const [finished] = spans;
    expect(finished.status.code).toBe(SpanStatusCode.ERROR);
    expect(finished.status.message).toBe("boom");
    expect(finished.attributes["error.code"]).toBe("INTERNAL_SERVER_ERROR");
    expect(finished.attributes["error.layer"]).toBe("service");
    expect(finished.attributes["error.layerName"]).toBe("ExampleService");
    expect(finished.events.some((event) => event.name === "exception")).toBe(true);
    expect(
      finished.events.find((event) => event.name === "exception")?.attributes?.["exception.message"]
    ).toBe("boom");
  });

  it("records the underlying cause on the span for SigNoz parity with PostHog", async () => {
    const cause = new Error(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: abc:def\\"}"))'
    );
    const error = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      layer: "repository",
      layerName: "TaskRepository",
      message: "Database query failed",
      cause,
    });

    const tracer = trace.getTracer("errors.test");
    await tracer.startActiveSpan("report-error", async (span) => {
      reportError(error);
      span.end();
    });

    const [finished] = exporter.getFinishedSpans();
    expect(finished?.status.message).toBe(`Database query failed: ${cause.message}`);
    expect(finished?.attributes["error.cause"]).toBe(cause.message);
    expect(
      finished?.events.find((event) => event.name === "exception")?.attributes?.[
        "exception.message"
      ]
    ).toBe(cause.message);
  });

  it("records plain Error exception on the active span", async () => {
    const error = new Error("plain boom");

    const tracer = trace.getTracer("errors.test");
    await tracer.startActiveSpan("report-error", async (span) => {
      reportError(error);
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const [finished] = spans;
    expect(finished.status.code).toBe(SpanStatusCode.ERROR);
    expect(finished.status.message).toBe("plain boom");
    expect(
      finished.events.find((event) => event.name === "exception")?.attributes?.["exception.message"]
    ).toBe("plain boom");
  });

  it("still annotates the active span when PostHog is unconfigured", async () => {
    setErrorReporter(undefined);
    await trace.getTracer("errors.test").startActiveSpan("unconfigured-error", async (span) => {
      expect(reportError(new Error("offline failure"))).toBeUndefined();
      span.end();
    });
    expect(exporter.getFinishedSpans()[0]?.status.message).toBe("offline failure");
  });

  it("does not throw when no active span exists", () => {
    expect(reportError(new Error("no span"))).toBe("error-event-id");
  });
});

describe("backend error capture", () => {
  const previousReporter = globalThis.m5ErrorReporter;
  afterEach(() => {
    globalThis.m5ErrorReporter = previousReporter;
  });

  it("reports a 5xx once with flat context and its native cause", () => {
    const captures: Array<{ error: unknown; properties: unknown }> = [];
    setErrorReporter({
      captureException(error, properties) {
        captures.push({ error, properties });
        return "error-event-id";
      },
    });
    const cause = new Error("upstream unavailable");
    const error = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      layer: "workflow",
      layerName: "Import",
      cause,
      context: { jobId: "job-1" },
    });
    const log = { error() {}, warn() {}, debug() {} };
    runWithActorTelemetry({ userId: "user-1", organizationId: "org-1" }, () => {
      captureServerError(error, { logger: log });
      captureServerError(error, { logger: log });
    });
    expect(captures).toEqual([
      {
        error,
        properties: expect.objectContaining({
          layer: "workflow",
          layerName: "Import",
          code: "INTERNAL_SERVER_ERROR",
          context: { jobId: "job-1" },
          "user.id": "user-1",
          "organization.id": "org-1",
        }),
      },
    ]);
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toHaveProperty("errorEventId", "error-event-id");
  });

  it("defers reporting so a later terminal capture can run", () => {
    const captures: Array<{ error: unknown; properties: unknown }> = [];
    setErrorReporter({
      captureException(error, properties) {
        captures.push({ error, properties });
        return "deferred-event-id";
      },
    });
    const error = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      layer: "workflow",
      layerName: "Import",
    });
    const log = { error() {}, warn() {}, debug() {} };
    runWithPosthogRequestState({ disableCapture: false, deferExceptionCapture: true }, () => {
      captureServerError(error, { logger: log });
    });
    expect(captures).toEqual([]);
    expect(error.logged).toBe(false);
    captureServerError(error, { logger: log });
    expect(captures).toHaveLength(1);
    expect(error.logged).toBe(true);
  });
});
