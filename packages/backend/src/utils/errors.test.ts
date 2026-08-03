import { SpanStatusCode, trace } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { registerTestTracerProvider, shutdownTestTracerProvider } from "../test/stubs/otel";
import {
  type ErrorReporter,
  reportError,
  ServerError,
  setErrorReporter,
} from "./errors";

describe("reportError otel", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let previousReporter: ErrorReporter | undefined;

  beforeEach(() => {
    previousReporter = globalThis.m5ErrorReporter;
    exporter = new InMemorySpanExporter();
    provider = registerTestTracerProvider(exporter);
    setErrorReporter({
      captureException: () => "sentry-event-id",
    });
  });

  afterEach(async () => {
    globalThis.m5ErrorReporter = previousReporter;
    await shutdownTestTracerProvider(provider, exporter);
  });

  it("records ServerError exception on the active span next to Sentry", async () => {
    const error = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      layer: "service",
      layerName: "ExampleService",
      message: "boom",
    });

    const tracer = trace.getTracer("errors.test");
    await tracer.startActiveSpan("report-error", async (span) => {
      const eventId = reportError(error);
      expect(eventId).toBe("sentry-event-id");
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
      finished.events.find((event) => event.name === "exception")?.attributes?.[
        "exception.message"
      ]
    ).toBe("boom");
  });

  it("records the underlying cause on the span for SigNoz parity with Sentry", async () => {
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
      finished.events.find((event) => event.name === "exception")?.attributes?.[
        "exception.message"
      ]
    ).toBe("plain boom");
  });

  it("does not throw when no active span exists", () => {
    expect(reportError(new Error("no span"))).toBe("sentry-event-id");
  });
});
