---
"@m5kdev/backend": minor
"@m5kdev/frontend": minor
"@m5kdev/web-ui": minor
"create-m5kdev": minor
---

Replace Sentry reporter imports, hints, and sentryEventId with optional PostHog initialization, flat error properties, and errorEventId, preserving causes, capture-once behavior, Actor identity, and OpenTelemetry context across services, HTTP, Workflows, and unhandled process failures.
Capture browser and React failures with authenticated User/Organization context and a translated recovery screen; make session-owned sign-out awaitable so logout and account closure clear reporting identity before navigation.
Upload matching Vite source maps privately per Deployment environment, delete maps after successful upload, keep upload credentials out of browser and runtime configuration, and invalidate build caches when upload configuration changes.
Align Starter and generated apps, declare Express 5 types as a backend peer and Node test types in Webapp, preserve optional feature boundaries, and document the 0.45.0 consumer migration.
