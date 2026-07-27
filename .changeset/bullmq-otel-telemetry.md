---
"@m5kdev/backend": patch
---

Enable BullMQ OpenTelemetry via `bullmq-otel` on workflow queues/workers (tracer/meter `@m5kdev/backend`, metrics on) and export OTLP metrics from `initTelemetry` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Bumps `bullmq` and `ioredis` for peer/type compatibility.
