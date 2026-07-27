import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import {
  detectResourcesSync,
  envDetectorSync,
  processDetectorSync,
  Resource,
} from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { applyTrpcAttributesOnHttpSpan } from "../utils/telemetry";

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

  const hasOtlp = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "default";

  sdk = new NodeSDK({
    resource: createResource(serviceName),
    traceExporter,
    ...(hasOtlp
      ? {
          logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
          metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
          }),
        }
      : {}),
    instrumentations: [
      new HttpInstrumentation({
        // Runs after HTTP instrumentation renames from http.route; restore a
        // procedure-aware label for tRPC so traces browse as trpc.router.procedure.
        applyCustomAttributesOnSpan: (span, request) => {
          applyTrpcAttributesOnHttpSpan(span, request);
        },
      }),
      new ExpressInstrumentation(),
      new PinoInstrumentation({
        // Correlation and OTLP export are handled in utils/logger.ts so they work
        // under ESM/tsx; instrumentation-pino only patches CJS require() loads.
        disableLogCorrelation: true,
        disableLogSending: true,
      }),
    ],
  });

  sdk.start();
  const traceExporterKind =
    traceExporter instanceof ConsoleSpanExporter ? "console" : `otlp (${otlpEndpoint})`;
  const logsExporterKind = hasOtlp ? `otlp (${otlpEndpoint})` : "correlation-only";
  const metricsExporterKind = hasOtlp ? `otlp (${otlpEndpoint})` : "off";
  console.info(
    `[otel] tracing enabled: ${traceExporterKind}; logs: ${logsExporterKind}; metrics: ${metricsExporterKind}`
  );
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = undefined;
}
