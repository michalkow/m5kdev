import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { registerTestTracerProvider, shutdownTestTracerProvider } from "../test/stubs/otel";
import {
  actorTelemetryFromJobData,
  actorTelemetryFromRequestContext,
  getActorTelemetrySpanAttributes,
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
