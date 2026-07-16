import { initTelemetry } from "@m5kdev/backend/lib/otel";

initTelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "starter-server",
});
