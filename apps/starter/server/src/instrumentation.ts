import { initTelemetry } from "@m5kdev/backend/lib/otel";

initTelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "starter-server",
});

// Require after OTel starts so importing the reporter cannot initialize Pino first.
// The server builds as CommonJS; keep this initialization synchronous.
const { initPosthog } =
  require("@m5kdev/backend/lib/posthog") as typeof import("@m5kdev/backend/lib/posthog");
initPosthog();
