import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { registerTestTracerProvider, shutdownTestTracerProvider } from "../test/stubs/otel";
import { enrichPinoLogArgs, parsePinoLogArgs } from "./otel-logging";

describe("enrichPinoLogArgs trace correlation", () => {
  let exporter: InMemorySpanExporter;
  let provider: ReturnType<typeof registerTestTracerProvider>;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = registerTestTracerProvider(exporter);
  });

  afterEach(async () => {
    await shutdownTestTracerProvider(provider, exporter);
  });

  it("adds trace_id to object logs when a span is active", () => {
    const tracer = trace.getTracer("test");
    tracer.startActiveSpan("test-span", () => {
      const enriched = enrichPinoLogArgs([{ label: "job-start" }]);
      const parsed = parsePinoLogArgs(enriched);
      expect(parsed.mergeObject.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(parsed.mergeObject.span_id).toMatch(/^[0-9a-f]{16}$/);
      expect(parsed.mergeObject.body).toBe("job-start");
    });
  });

  it("adds trace_id to string-only logs when a span is active", () => {
    const tracer = trace.getTracer("test");
    tracer.startActiveSpan("test-span", () => {
      const enriched = enrichPinoLogArgs(["plain message"]);
      const parsed = parsePinoLogArgs(enriched);
      expect(parsed.mergeObject.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(parsed.message).toBe("plain message");
    });
  });

  it("omits trace_id when no span is active", () => {
    const enriched = enrichPinoLogArgs([{ label: "bootstrap" }]);
    const parsed = parsePinoLogArgs(enriched);
    expect(parsed.mergeObject.trace_id).toBeUndefined();
  });
});
