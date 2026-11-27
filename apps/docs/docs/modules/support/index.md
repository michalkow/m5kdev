---
sidebar_position: 17
---

# Support module

`SupportModule` is an omittable Core Module for private User-owned Support Cases. It supplies a platform-admin Support desk, reusable web widget, complete versioned JSON/OpenAPI and tRPC operations, optional translation/documentation AI, publication-based reporting and three-face CSAT. It does not use Conversation/Mastra Memory for support history.

## Composition

Register Auth, File, Tag and Workflow before Support in the app's explicit module array. Workflow requires Redis. Omit Support to exclude the feature; AI is optional and human support still uses the required Workflow infrastructure. Re-export every table from `support.db` in the app schema, include Tag tables, and generate/apply the app's additive migration before booting the module.

```ts
import { SupportModule } from "@m5kdev/backend/modules/support/support.module";
import * as supportTables from "@m5kdev/backend/modules/support/support.db";

// Add to createBackendApp(config, [...]) with Auth/File/Tag/Workflow composed:
new SupportModule({ maxAttachments: 5, maxFileBytes: 10 * 1024 * 1024 });
// schema.ts: export * from "@m5kdev/backend/modules/support/support.db";
```

Support grants default to ordinary Users reading/writing their own Cases and platform admins reading/writing/publishing/redacting all Cases. Organization roles and assignment do not confer access. Pass app-specific `grants` explicitly. Shared Support Tags use `scope: "support"`; ordinary owner-filtered Tag operations do not expose them.

Reuse `SupportWidget` within the signed-in shell. Compose `SupportAdminRouter()` through `AuthAdminRouter`'s `extraRoutes`, with an explicit `/admin/support` extra link. The screen checks the current platform role; services enforce permissions independently. Keep the existing Auth/tRPC/query/ServerEvent providers. The query provider isolates caches by signed-in User/session/role and clears an injected client when that scope changes; custom identity flows must supply an appropriate `cacheScope`. `useSupport` uses nuqs and TanStack Query with Kernel SSE hints plus authoritative refetch. No additional global provider or WebSocket transport is installed.

## HTTP and native clients

For manifests larger than the Kernel JSON default, configure `json: defaults => ({ ...defaults, limit: "5mb" })` at the app root. Starter includes this when Support is selected.

The module mounts `/api/v1/support`; `/openapi.json` is generated from the same operation schemas as its thin Express handlers. `createSupportTRPC` delegates to the same services. Every settings, catalog, attachment, feedback, documentation and automation operation is covered. See the Starter's public Support API guide and `scripts/support-native-reference.mjs` for consumer examples.

Better Auth now accepts signed bearer User sessions through its bearer plugin. Native clients sign in with ordinary User credentials, securely store `set-auth-token`, and send it in `Authorization: Bearer …`. Session expiry/logout/revocation remain Better Auth concerns. The reference client is plain JavaScript; no React Native widget or Expo-specific login UI ships.

Cases use message acceptance order and a separate durable change sequence. Commands retain actor/operation/payload idempotency, state edits require expected revisions, and change cursors recover messages, tombstones and state after missed hints. Server events contain identifiers, never transcript snapshots.

## Optional automation

Automation defaults off. Configure either typed `translation`/`assistant` provider ports, or `models` backed by the optional registered AI module:

```ts
new SupportModule({
  models: {
    assistant: { model: "your-configured-model" },
    translation: { model: "your-configured-model", languages: ["en", "en-GB", "pl"] },
  },
  documentation: {
    applicationVersion: "1.0.0",
    allowedOrigins: ["https://help.example.com"],
    manifestPath: "./documentation/support-manifest.json",
  },
});
```

Model names are app-owned; this example chooses no provider or allowance. Before enabling a feature in Support settings, configure explicit monthly calls, daily calls per User, input/output character limits, concurrency, attempts (1–3) and timeout. Reservations persist before each provider attempt, including failures and abandoned worker leases. The built-in AI adapters disable hidden SDK/service retries and honour abort signals. Custom providers must perform one attempt and honour the supplied signal. Human messaging remains available after exhaustion. Counts/characters are operating caps, not a promised currency ceiling; set provider-side billing controls separately where needed.

Workflow processes persisted work intents and recovers them periodically. Publication rechecks source hash, handling epoch, User lifecycle generation, current staff authorization and active corpus. Human requests and public staff replies take over immediately. Reopening preserves human control. AI never closes a Case; Users/admins resolve explicitly.

Incoming originals publish immediately. Translation preserves authored originals, exact published text and provider/source provenance. Outbound failures hold publication; retries, explicit send-original and optional previews are separate operations. Notes and their derivatives stay internal.

## Documentation releases

`writeSupportDocumentationPart` runs after a public Docusaurus locale build. `combineSupportDocumentationParts` runs after all locales, producing one versioned `support-manifest.json` with application compatibility, locale/Experience, canonical URLs, plain rendered article text and SHA-256 hashes. The Starter integrates both. The exporter consumes built public help, not framework engineering docs or arbitrary websites. Its lifecycle follows the [Docusaurus postBuild API](https://docusaurus.io/docs/api/plugin-methods/lifecycle-apis).

Configure a local release manifest path, or stage the exported manifest through the admin API after deploying documentation. Server-hosted Starter help is copied beside the backend. Landing/standalone help does not imply that the backend has that file: supply `SUPPORT_DOCUMENTATION_MANIFEST` via the app's deployment artifact, or upload the complete manifest through Support. Keep application compatibility and canonical origins aligned with the release.

Workflow validates and indexes a complete release before activation. A bad refresh exposes a failed status and preserves the previous still-authorized compatible corpus. Withdrawal removes retrieval eligibility. Retrieval selects Experience and locale/fallback, then supplies only authorized public sources and public history. Complete AI replies must cite supplied canonical URLs; absent evidence hands off. Provider judgments are not a proof of factual correctness, so retain synthetic groundedness/isolation evaluations when changing prompts/models.

## Files and privacy

Support reserves personal File uploads, verifies bounded actual bytes/type, then rotates them to an immutable sealed key. Initial types are JPEG/PNG/WebP, PDF and text/logs, with defaults of five Files per message and 10 MiB each. A Case-authorized trusted File seam issues short-lived downloads without proxying response bytes; generic File endpoints cannot bypass it. Note Files remain staff-only.

Redaction scrubs originals/renditions/citations, records an audit reason and publishes a tombstone. It revokes new access and physically deletes issued-download targets. Cleanup stays pending while an issued upload authorization could recreate its source; the durable sweep retries after expiry. Immediate Purge can return a retryable conflict rather than falsely finish that cleanup.

Support explicitly registers an Auth User lifecycle participant. Close/Restore cancel work and advance handling epochs; Auth's monotonic lifecycle generation also fences work created before a temporary module omission. Staff retain grace-period access. Purge removes owned Cases and derivatives, scrubs the purged actor's authored content elsewhere and deletes identifiable event/metric history. Keep Support composed while retained Support data needs lifecycle cleanup; removing a module from an already populated installation requires an app data migration.

Resolved history has no default expiry. Optional `retentionDays` removes old resolved Cases through the same cleanup path. Retained-data reports change after Purge; permanent anonymized analytics and legal-hold tooling are not supplied.

## Reporting limits

Calendar-time clocks start from customer-visible publication. First-human response includes earlier AI time; handoff wait is separate; consecutive User messages preserve outstanding demand. Notes, previews and failed/pending translations do not count as replies. Resolution cycles, elapsed lifetime and accumulated unresolved time remain distinct.

The initial overview has live queue counts/oldest unanswered and a bounded cohort of Cases created in the selected 30-day default/90-day maximum window. A 500-Case cap is explicitly reported; narrow the cohort when partial. It shows median/p95/sample/unanswered counts and happy/all CSAT separated by human/AI. It does not infer active handle time, occupancy, business-hours performance or an SLA that was never configured.
