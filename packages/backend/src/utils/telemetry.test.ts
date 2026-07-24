import type { IncomingMessage } from "node:http";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { registerTestTracerProvider, shutdownTestTracerProvider } from "../test/stubs/otel";
import {
  actorTelemetryFromJobData,
  actorTelemetryFromRequestContext,
  applyTrpcAttributesOnHttpSpan,
  attachTrpcPathToRequest,
  formatTrpcHttpSpanName,
  getActorTelemetrySpanAttributes,
  getTrpcPathsFromRequest,
  runWithActorTelemetry,
  withSpan,
} from "./telemetry";

describe("actorTelemetryFromRequestContext", () => {
  it("returns userId when user is present", () => {
    expect(actorTelemetryFromRequestContext({ user: { id: "user-1" } })).toEqual({
      userId: "user-1",
    });
  });

  it("prefers actor organizationId over session", () => {
    expect(
      actorTelemetryFromRequestContext({
        user: { id: "user-1" },
        session: { activeOrganizationId: "org-session" },
        actor: { organizationId: "org-actor" },
      })
    ).toEqual({
      userId: "user-1",
      organizationId: "org-actor",
    });
  });

  it("falls back to session activeOrganizationId", () => {
    expect(
      actorTelemetryFromRequestContext({
        user: { id: "user-1" },
        session: { activeOrganizationId: "org-session" },
      })
    ).toEqual({
      userId: "user-1",
      organizationId: "org-session",
    });
  });
});

describe("actorTelemetryFromJobData", () => {
  it("extracts userId and organizationId from job payloads", () => {
    expect(
      actorTelemetryFromJobData({
        userId: "user-42",
        organizationId: "org-9",
        other: true,
      })
    ).toEqual({
      userId: "user-42",
      organizationId: "org-9",
    });
  });

  it("ignores invalid shapes", () => {
    expect(actorTelemetryFromJobData(null)).toEqual({});
    expect(actorTelemetryFromJobData({ userId: 1 })).toEqual({});
  });
});

describe("formatTrpcHttpSpanName", () => {
  it("formats a single procedure as trpc.router.procedure", () => {
    expect(formatTrpcHttpSpanName(["auth.getPreferences"])).toBe("trpc.auth.getPreferences");
  });

  it("joins batch procedure paths", () => {
    expect(formatTrpcHttpSpanName(["auth.getPreferences", "billing.listInvoices"])).toBe(
      "trpc.auth.getPreferences,billing.listInvoices"
    );
  });

  it("returns undefined for empty paths", () => {
    expect(formatTrpcHttpSpanName([])).toBeUndefined();
  });
});

describe("attachTrpcPathToRequest", () => {
  it("collects unique procedure paths on the request", () => {
    const req = {} as IncomingMessage;
    attachTrpcPathToRequest(req, "auth.getPreferences");
    attachTrpcPathToRequest(req, "auth.getPreferences");
    attachTrpcPathToRequest(req, "billing.listInvoices");
    expect(getTrpcPathsFromRequest(req)).toEqual([
      "auth.getPreferences",
      "billing.listInvoices",
    ]);
  });

  it("no-ops without a request or path", () => {
    expect(() => attachTrpcPathToRequest(undefined, "auth.getPreferences")).not.toThrow();
    const req = {} as IncomingMessage;
    attachTrpcPathToRequest(req, undefined);
    expect(getTrpcPathsFromRequest(req)).toEqual([]);
  });
});

describe("applyTrpcAttributesOnHttpSpan", () => {
  let exporter: InMemorySpanExporter;
  let provider: ReturnType<typeof registerTestTracerProvider>;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = registerTestTracerProvider(exporter);
  });

  afterEach(async () => {
    await shutdownTestTracerProvider(provider, exporter);
  });

  it("renames the HTTP span to trpc.router.procedure", async () => {
    const req = {} as IncomingMessage;
    attachTrpcPathToRequest(req, "auth.getPreferences");

    await withSpan({ name: "POST /trpc" }, async (span) => {
      applyTrpcAttributesOnHttpSpan(span, req);
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("trpc.auth.getPreferences");
    expect(spans[0]?.attributes["rpc.system"]).toBe("trpc");
    expect(spans[0]?.attributes["rpc.method"]).toBe("auth.getPreferences");
    expect(spans[0]?.attributes["trpc.path"]).toBe("auth.getPreferences");
  });

  it("marks batch requests", async () => {
    const req = {} as IncomingMessage;
    attachTrpcPathToRequest(req, "auth.getPreferences");
    attachTrpcPathToRequest(req, "billing.listInvoices");

    await withSpan({ name: "POST /trpc" }, async (span) => {
      applyTrpcAttributesOnHttpSpan(span, req);
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.name).toBe("trpc.auth.getPreferences,billing.listInvoices");
    expect(spans[0]?.attributes["rpc.method"]).toBe("batch");
    expect(spans[0]?.attributes["trpc.batch"]).toBe(true);
  });

  it("leaves non-tRPC requests unchanged", async () => {
    await withSpan({ name: "GET /health" }, async (span) => {
      applyTrpcAttributesOnHttpSpan(span, {} as IncomingMessage);
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.name).toBe("GET /health");
    expect(spans[0]?.attributes["rpc.system"]).toBeUndefined();
  });
});

describe("runWithActorTelemetry", () => {
  it("exposes merged actor attrs for span creation", () => {
    runWithActorTelemetry({ userId: "user-1" }, () => {
      runWithActorTelemetry({ organizationId: "org-1" }, () => {
        expect(getActorTelemetrySpanAttributes()).toEqual({
          "user.id": "user-1",
          "organization.id": "org-1",
        });
      });
    });
  });
});

describe("withSpan actor attributes", () => {
  let exporter: InMemorySpanExporter;
  let provider: ReturnType<typeof registerTestTracerProvider>;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = registerTestTracerProvider(exporter);
  });

  afterEach(async () => {
    await shutdownTestTracerProvider(provider, exporter);
  });

  it("inherits ALS attrs on nested spans", async () => {
    await runWithActorTelemetry({ userId: "user-1", organizationId: "org-1" }, async () => {
      await withSpan({ name: "parent" }, async () => {
        await withSpan({ name: "child" }, async () => undefined);
      });
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(span.attributes["user.id"]).toBe("user-1");
      expect(span.attributes["organization.id"]).toBe("org-1");
    }
  });

  it("lets explicit span attributes override ALS attrs", async () => {
    await runWithActorTelemetry({ userId: "user-1", organizationId: "org-1" }, async () => {
      await withSpan(
        { name: "override", attributes: { "user.id": "override-user" } },
        async () => undefined
      );
    });

    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes["user.id"]).toBe("override-user");
    expect(span?.attributes["organization.id"]).toBe("org-1");
  });

  it("nests child spans under the active parent span", async () => {
    await withSpan({ name: "workflow.cron.example" }, async () => {
      await withSpan({ name: "service.Example.run" }, async () => undefined);
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);

    const root = spans.find((span) => span.name === "workflow.cron.example");
    const child = spans.find((span) => span.name === "service.Example.run");
    expect(child?.parentSpanId).toBe(root?.spanContext().spanId);
  });
});
