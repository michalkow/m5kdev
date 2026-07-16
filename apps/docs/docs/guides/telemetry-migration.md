---
sidebar_position: 7
---

# Telemetry migration

This guide covers enabling OpenTelemetry tracing and correlated Pino logging in
existing m5kdev apps. The stack exports traces and logs via OTLP (for example to
[self-hosted SigNoz](https://signoz.io/)) and falls back to console trace output
in local development when no exporter endpoint is configured.

New apps scaffolded from the starter template already include the wiring described
below. Existing apps follow the migration steps in this guide.

## What changed in the stack

| Layer | Change |
| --- | --- |
| `@m5kdev/backend` | `initTelemetry` / `shutdownTelemetry` in `lib/otel.ts`; automatic spans on HTTP, Express, tRPC, service procedures, repository queries, and DB calls; Pino log correlation (`trace_id`, `span_id`) and OTLP log export in `utils/logger.ts`. |
| `@m5kdev/backend` | `withSpan`, `getTracer`, and `serializeSpanValue` helpers in `utils/telemetry.ts` for custom spans in app services. |
| App server | `instrumentation.ts` bootstraps telemetry before the rest of the app loads; `index.ts` flushes telemetry on shutdown. |
| App shared `.env` | Optional `OTEL_*` variables documented in `.env.example`. |

## Database migration

**No schema change is required.** Telemetry is opt-in via environment variables and
does not touch the database.

## Required server changes

### 1. Add `instrumentation.ts`

Create `apps/<app>/server/src/instrumentation.ts` and call `initTelemetry` before
any other backend code imports Pino or the app kernel:

```ts
import { initTelemetry } from "@m5kdev/backend/lib/otel";

initTelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "<app>-server",
});
```

`initTelemetry` is a no-op when `OTEL_SDK_DISABLED=true`.

### 2. Import instrumentation first in `index.ts`

The server entry file must load instrumentation before `app.ts` (or any module
that transitively imports `@m5kdev/backend/utils/logger`):

```ts
import "./instrumentation";
import type { Server } from "node:http";
import { shutdownTelemetry } from "@m5kdev/backend/lib/otel";
import { builtBackendApp } from "./app";

// ...

async function shutdown(): Promise<void> {
  try {
    await builtBackendApp.shutdown();
  } catch (e) {
    // ...
  }
  try {
    await shutdownTelemetry();
  } catch (e) {
    // ...
  }
  // close HTTP server, then process.exit(0)
}
```

On startup you should see a line similar to:

```text
[otel] tracing enabled: console; logs: correlation-only
```

or, when OTLP is configured:

```text
[otel] tracing enabled: otlp (https://your-ingester.example.com); logs: otlp (...)
```

### 3. Add environment variables

Add the following to `apps/<app>/shared/.env.example` (and your local `.env` when
you want to export telemetry):

```env
# Optional OpenTelemetry (SigNoz / OTLP). When unset, dev uses console exporter.
# Railway public networking uses HTTPS on 443 — do not append :4317/:4318.
# The same OTLP endpoint exports traces and Pino logs (correlated via trace_id/span_id).
# OTEL_EXPORTER_OTLP_ENDPOINT=https://your-ingester.example.com
# OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# OTEL_SERVICE_NAME=<app>-server
# OTEL_RESOURCE_ATTRIBUTES=deployment.environment=development
# OTEL_SDK_DISABLED=true
```

| Variable | Purpose |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP base URL for traces and logs. When set, both signals export to this endpoint. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Use `http/protobuf` for HTTP OTLP (port 4318 semantics over HTTPS on managed hosts). |
| `OTEL_SERVICE_NAME` | `service.name` resource attribute; defaults to the name passed to `initTelemetry`. |
| `OTEL_RESOURCE_ATTRIBUTES` | Extra resource tags (for example `deployment.environment=production`). |
| `OTEL_SDK_DISABLED` | Set to `true` to disable the SDK entirely (tests, hermetic scripts). |

**Do not** set `NODE_OPTIONS=--require @opentelemetry/auto-instrumentations-node/register`.
The backend ships a focused SDK setup (`http`, `express`, Pino integration) and
auto-instrumentations can conflict with it.

## What you get automatically

Once wired, a typical request produces a span hierarchy like:

```text
HTTP (auto)
└── trpc.<router>.<procedure>
    └── service.<ServiceName>.<procedure>
        └── <procedure>.<step> / <procedure>.handle
            └── repository.<RepositoryName>.<query>   ← only when using .query().handle()
```

Repository methods that call `throwableQuery` directly (for example `queryList`, `create`,
`update`) are **not** traced at the DB layer. To trace a specific DB operation, wrap it
in a named repository query:

```ts
findAccountClaimByCode = this.query("findAccountClaimByCode").handle(async ({ code }) => {
  const result = await this.throwableQuery(() => /* drizzle */);
  // ...
});
```

Background work uses workflow spans as trace roots:

```text
workflow.cron.<name>  or  workflow.job.<name>
└── service.* / repository.* (when handlers use traced query builders)
```

`this.logger` calls inside an active span automatically include `trace_id`,
`span_id`, and `trace_flags` on the log record. When `OTEL_EXPORTER_OTLP_ENDPOINT`
is set, those logs are also exported via OTLP and can be correlated with traces
in SigNoz (or any OTLP-compatible backend).

No changes are required at individual `this.logger.info(...)` call sites in
services or repositories — child loggers from `BaseService` / `BaseRepository`
inherit the root Pino configuration.

## Custom spans in app services

Use `withSpan` from `@m5kdev/backend/utils/telemetry` for domain-specific
instrumentation inside procedure handlers or other async work:

```ts
import { serializeSpanValue, withSpan } from "@m5kdev/backend/utils/telemetry";

.handle(async ({ input }) => {
  return withSpan(
    {
      name: "posts.list.query",
      attributes: { input: serializeSpanValue(input) },
    },
    () =>
      this.repository.posts.queryList(input, {
        globalSearchColumns: ["title", "excerpt", "content"],
      })
  );
});
```

`serializeSpanValue` JSON-stringifies input/output for span attributes and
truncates large payloads. Prefer attributes for structured data; use
`this.logger` for human-readable operational messages (they will still correlate
to the active span).

## OTLP backend notes (SigNoz / Railway)

- **HTTP OTLP on public URLs:** Many hosted ingesters (including Railway-deployed
  SigNoz) expose OTLP over **HTTPS on port 443**, not raw `:4317` / `:4318` on the
  public hostname. Use `https://your-ingester.example.com` without appending
  `:4318`.
- **Protocol:** Set `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` to match the HTTP
  exporter used by `@m5kdev/backend`.
- **Verification:** After starting the server, call any tRPC endpoint, then in
  SigNoz open **Traces** (filter by `service.name`) and **Logs** (confirm
  `trace_id` is present on records emitted during the request).

## E2E / CI (optional)

Playwright e2e servers can opt into the same OTLP endpoint. The starter app sets
`OTEL_*` in `apps/starter/e2e/servers.ts` unless `OTEL_SDK_DISABLED=true`. Mirror
that pattern if you want e2e traces in your observability backend; set
`OTEL_SDK_DISABLED=true` in CI when you do not want outbound telemetry.

## Disable telemetry

| Scenario | Approach |
| --- | --- |
| Local dev, no exporter | Omit `OTEL_EXPORTER_OTLP_ENDPOINT` — traces print to the console; logs stay on stdout with correlation fields when inside a span. |
| Tests / scripts | `OTEL_SDK_DISABLED=true` |
| E2E hermetic runs | `OTEL_SDK_DISABLED=true` in the e2e server env |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No `[otel] tracing enabled` on boot | `instrumentation.ts` not imported first, or `OTEL_SDK_DISABLED=true`, or `NODE_ENV=production` without `OTEL_EXPORTER_OTLP_ENDPOINT` (production has no console fallback). |
| Traces never arrive at SigNoz | Wrong endpoint (try HTTPS without `:4318`), wrong protocol (`grpc` vs `http/protobuf`), or ingester not reachable from your network. |
| Logs missing `trace_id` / `span_id` | Logger imported before `initTelemetry()` runs; ensure `import "./instrumentation"` is the first line in `index.ts`. |
| Logs in SigNoz but not linked to traces | Log emitted outside an active span, or exporter received logs before trace context was established. |
| Double or conflicting telemetry | `NODE_OPTIONS` preloading `@opentelemetry/auto-instrumentations-node` alongside the app `instrumentation.ts` entry. Remove it. |

## Migration checklist

1. Ensure `@m5kdev/backend` is on a version that includes `lib/otel` and tracing middleware (upgrade the workspace package if needed).
2. Add `apps/<app>/server/src/instrumentation.ts`.
3. Add `import "./instrumentation"` as the first import in `apps/<app>/server/src/index.ts`.
4. Call `shutdownTelemetry()` during server shutdown.
5. Document `OTEL_*` variables in `apps/<app>/shared/.env.example`.
6. Configure OTLP env vars for environments where you want export (staging, production, or local SigNoz).
7. Restart the server and confirm `[otel] tracing enabled` on boot.
8. Hit a traced endpoint and verify spans (and correlated logs) in your observability UI.

## Related docs

- [Backend package](/packages/backend)
- [Getting started](/guides/getting-started)
