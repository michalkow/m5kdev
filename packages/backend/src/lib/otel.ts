import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  detectResourcesSync,
  envDetectorSync,
  processDetectorSync,
  Resource,
} from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export interface TelemetryInitOptions {
  serviceName: string;
  env?: string;
}

let sdk: NodeSDK | undefined;

function resolveTraceExporter(env: string | undefined) {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return new OTLPTraceExporter();
  }

  if (env !== "production") {
    return new ConsoleSpanExporter();
  }

  return undefined;
}

function createResource(serviceName: string): Resource {
  const detected = detectResourcesSync({
    detectors: [envDetectorSync, processDetectorSync],
  });

  return detected.merge(
    new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? serviceName,
    })
  );
}

export function initTelemetry({
  serviceName,
  env = process.env.NODE_ENV,
}: TelemetryInitOptions): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === "true") return;

  const traceExporter = resolveTraceExporter(env);
  if (!traceExporter) return;

  sdk = new NodeSDK({
    resource: createResource(serviceName),
    traceExporter,
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  });

  sdk.start();
  const exporterKind =
    traceExporter instanceof ConsoleSpanExporter
      ? "console"
      : `otlp (${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "default"})`;
  console.info(`[otel] tracing enabled: ${exporterKind}`);
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = undefined;
}
