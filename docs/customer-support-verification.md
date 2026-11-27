# Support implementation verification

The accepted contract is GitHub issue [#124](https://github.com/michalkow/m5kdev/issues/124), derived from [the agreed scope](customer-support-module-scope.md). Stories below use its numbering. These checks use synthetic accounts, loopback PostgreSQL/Redis and deterministic provider ports. No hosted model, object storage, database or telemetry allowance was used. No staging or production migration was applied.

## Story trace

Implementation paths are relative to `packages/backend/src/modules/support/` unless qualified. The `tests/` files exercise public services against disposable PostgreSQL schemas; native tests cross real Better Auth/HTTP boundaries.

| Stories | Implemented boundary | Evidence |
| --- | --- | --- |
| 1–3, 9 | User-owned Cases; current User/grants checked independently of Membership | `tests/support.service.test.ts`; browser uses customer without Organization |
| 4 | Reusable `SupportWidget`, `SupportPanel`, localized controls and loading/error states | `scripts/verify-support-browser.cjs`; 420px widget artifact |
| 5 | Actor/payload-bound command identities | service and native tests repeat Case/message submissions and reject changed payload |
| 6–7 | Consistent cursor snapshots, paged history, changes/redaction recovery, explicit viewed-message receipts and unread count | service/native tests; local SSE/cursor experiment below |
| 8, 29 | Admin-origin contact starts human-handled | service boundary; local native staff-initiated SSE recovery Case |
| 10, 19 | Public/internal visibility and distinct composer; notes leave demand/lifecycle unchanged | service tests; real browser submits private note and checks customer API/widget |
| 11–14 | Expected-version updates, assignment/take, priority, waiting responsibility, shared catalog and filters | `tests/support.service.test.ts`; `SupportDeskTools` + list/update/catalog APIs |
| 15–17 | Snooze wake, explicit resolution, unlimited reopen into new cycle, retained takeover | service workflow tests; browser resolves Case |
| 18, 36–38 | Accepted/publication split, immutable published text, previews, original viewing, held failures and explicit original/retry | `tests/support.automation.test.ts`; translated real-worker/browser reply |
| 20–23 | Audited tombstones, sealed File sharing, guarded download, authoritative bytes/type/count | `tests/support.attachments.test.ts` uses local object store and issued URLs |
| 24–28 | Opt-in cited answers, explicit person request, generation/source fences and failure handoff; resolve remains explicit | `tests/support.ai.test.ts`; Redis/browser synthetic cited answer; always-present human/resolve controls |
| 30–32 | Rendered documentation exporter, version/origin/hash/applicability validation, staged activation/withdrawal | documentation/AI tests; actual Docusaurus en/en-GB manifest build |
| 33–35 | App-native/fallback/working locales, explicit/detected/UI precedence, provider language catalog | automation tests including gated detection across handoff; settings/language APIs and UI |
| 39–40 | Independent capability switches, persisted usage reservation, retry/lease/concurrency and per-User/month caps | automation/AI tests; real Redis worker with bounded synthetic provider configuration |
| 41–42 | Versioned static expectation and IANA timezone/weekly/holiday display calendar | `tests/support.calendar.test.ts`; availability/settings API and localized UI |
| 43–46 | Retained event ledger, publication-based response distributions, handoff, cycle/lifetime/unresolved clocks | `tests/support.metrics.test.ts`; overview projection/API; service tests |
| 47–49 | Eligible resolved-cycle editable three-face feedback and human/AI split | service tests; browser single happy-face click observes persisted selection |
| 50–51 | Close/Restore generation invalidation, User purge, redaction, configured retention and File cleanup recovery | `tests/support.privacy.test.ts`; attachment tests; generated additive migration applied locally |
| 52–54 | Versioned JSON/OpenAPI parity with tRPC; signed bearer expiry/logout; plain JS reference client | HTTP test compares all operation IDs; native + `auth.bearer.test.ts`; actual Node-fetch reference used against Kernel |
| 55 | Live identity/grants and authorization/lifecycle/source checks before autonomous publication | service/AI/privacy/attachment tests; frontend identity cache isolation tests |
| 56–57 | Explicit omittable module, Auth/File/Tag/Workflow dependencies, reusable package exports, established frontend stack | real `createBackendApp` fixture + Redis worker; package and Starter builds; 76 CLI composition tests |
| 58 | User widget, admin desk and API journeys in every Starter locale | en/en-GB documentation build; generated manifest contains the shipped guides |

## Checks run

- Affected backend suites: 103 tests in 26 suites passed, including Support, bearer Auth, account lifecycle, Server events, File and Tag regression tests. The focused Support/native subset has 31 tests in 11 suites. These include PostgreSQL isolation, idempotency, pagination, notes, lifecycle, budgets, translation failure/retry, takeover, File sealing/redaction, docs, metrics, calendars and CSAT.
- Web UI: identity-cache isolation for default/injected QueryClients and safe announced message rendering, settings/documentation loading and failed-read recovery, retained semantic request identities, exact mutation Retry, immediate unread badge invalidation and scoped Escape cleanup: 8 tests passed.
- CLI creation/product-documentation/feature-catalog suites: 76 tests passed with Support selected and omitted. Required modules are implied; default documentation remains independent.
- Backend, frontend and web-ui types/builds; Starter server and webapp types/builds passed. Build dependent packages in order: backend, frontend, web-ui, then Starter. Concurrent builds can observe an intermediate cleaned declaration directory.
- Generated migrations `0002_happy_barracuda`, `0003_chilly_abomination` and `0004_hesitant_peter_parker` applied through Starter `drizzle:migrate` against the disposable loopback database. No SQL/journal/snapshot was hand-authored.
- Actual Starter Docusaurus build produced both en and en-GB output and a versioned help manifest. No external corpus crawl was used.
- Real Kernel/Auth/File/Tag/Support/Workflow composition on local PostgreSQL/Redis published a deterministic cited AI answer, then a translated human reply. The browser verified note isolation through API and UI, smiley feedback, single trigger semantics and Enter/Escape behavior with zero page errors.
- A User-authenticated `/events` stream received a minimal Case-ID notification without message text. Closing it, sending another reply and resuming from the prior cursor recovered both replies from PostgreSQL.

## Review regression evidence

The six Standards/Spec findings were reproduced through generated-app, real PostgreSQL Service, local object-store and React Query hook boundaries before fixing them:

- Notifications no longer excludes Support's screen guides. The Support-without-Notifications creation regression checks both en and en-GB guide files.
- Settings and corpus loading/failure remain visible. Retry refetches failed reads independently and resends the exact latest failed create/send command. A/B/A failures retain separate request identities; changed UI locale and preview intent produce new identities. Backend retries with changed authored locale or preview return 409.
- File sealing persists both source and intended target locators before writing bytes. Interruptions before the target write and after the write are recoverable by retry or purge. Pending sharing intents cannot bypass the generic File boundary.
- AI claims and publications fingerprint every supplied transcript source under the Case lock. Gated completion after historical public-message redaction cannot publish stale text. Unrelated human translation still publishes across that redaction; no new Work/Case lock inversion was introduced.
- Read acknowledgements require published `messageIds` from the actual viewed page alongside `throughSequence`. Retrying a pre-publication acknowledgement cannot consume a translated reply published later at a lower acceptance sequence. Case, list and widget unread counts remain one until that reply's ID is acknowledged. The native reference client exposes `markViewed(transcript)`; JSON/OpenAPI/tRPC share the same required schema.
- A configured user-level read-all grant sees the same public Cases in list and direct reads. Platform-admin-only settings and notes remain unchanged.

The assembled browser check additionally gates a send while a newer draft is typed, commits a second send while losing its response, closes/reopens the widget, retries the identical payload/client ID and verifies one persisted message. It acknowledges the displayed published IDs, selects feedback and closes with Escape. `browser-result.json` records zero page errors. Drafts and unresolved commands remain in the authenticated component tree and are discarded when that tree remounts for a different identity.

Migration `0004_hesitant_peter_parker` adds the cumulative message-ID receipts with an empty-array default. It was generated through Starter `drizzle:generate` and applied through `drizzle:migrate` only to loopback `support_migrations` on port 55439, schema `app`. The temporary Starter shared `.env` was removed. No hosted resources or telemetry were used; local fixture app workers were stopped after verification. Existing disposable PostgreSQL/Redis infrastructure was reused.

## Bugbot language-change regression evidence

The outbound language race was reproduced through public Support services against loopback PostgreSQL before the fix: a staff reply accepted before detection completed remained absent from the customer transcript. A gated provider also reproduced cancellation after an explicit language change during translation. Both now converge automatically to the current support language. Effective detection changes fence the old generation and queue held staff replies just as explicit changes do; outbound claims wait for the latest pending detection. Source, handling, lifecycle and current publication authorization fences remain enforced. Translation-state changes append message-specific internal Case events, including retargeting, explicit retry and terminal capability/allowance failures, so cursor recovery observes the same message state as a full refresh.

`tests/support.outbound.test.ts` adds eight deterministic cases:

- Detection completes before the held reply is claimed: only the detected target is translated and the customer sees one reply.
- An explicit language change during translation discards the old result and publishes the replacement once.
- The new target matches the authored language: the authored text is used without another provider call, both with automatic publication and with preview approval still required.
- Detection changes a ready preview: the old preview cannot be approved; the replacement remains held for fresh approval.
- Translation is disabled during a provider call: the held reply is visibly failed instead of remaining pending.
- The superseded call finishes after its replacement preview: it cannot clear that ready preview; repeated approval produces one publication event and one unread reply.
- Several held replies retarget in one transaction: admin cursor recovery returns every affected message with distinct Case changes, then returns their ready previews. The detection and capability-loss cases also recover pending/failed fields from pre-change admin cursors.

The existing real local object-store fixture also gates an attached reply across an in-flight language change. Customer download fails while held and after the stale completion, then returns the expected bytes after the corrected translation publishes. Its two-call allowance and one-attempt-per-work configuration remain enforced; replacements use normal durable work and shared usage reservations, with no hidden provider retries.

For this fix, the affected backend command passed **103 tests in 26 suites**, including the **31 Support tests in 11 suites**. Backend, frontend, web-ui and Starter server/webapp types and builds passed in dependency order. The complete Starter help build passed for en and en-GB; generated customer and desk pages contain the updated language-change/preview guidance, and the API guides were updated in both locales. Targeted Biome checks passed with six existing optional-chain warnings. The earlier browser/Redis evidence above was reused; no assembled browser or UI/CLI test rerun was needed because their sources did not change. No schema changed and no migration ran. All new execution used synthetic provider ports, loopback PostgreSQL and local object storage; hosted usage was zero and existing disposable infrastructure was reused.

## Reproduce the assembled browser check

Use a disposable local database named `support_*`, migrated with Starter's `drizzle:migrate`, and a disposable loopback Redis instance. The fixture rejects non-loopback storage and exits after ten minutes. It seeds only synthetic `@fixture.test` accounts with a public local-test password. It is maintainer verification code, excluded from published backend output.

Build the reusable packages in dependency order, then build Starter webapp with `VITE_SERVER_URL=http://127.0.0.1:43191`, `VITE_APP_URL=http://127.0.0.1:43191`, and `VITE_PUBLIC_POSTHOG_KEY=demo`. Keep hosted source-map upload credentials absent. From the repository root:

```sh
APP_ENV=local APP_SLUG=support-verification DATABASE_SCHEMA=app PORT=43191 \
OTEL_SDK_DISABLED=true \
SUPPORT_VERIFICATION_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/support_verification \
SUPPORT_VERIFICATION_REDIS_URL=redis://127.0.0.1:REDIS_PORT \
pnpm --filter @m5kdev/backend exec tsx src/test/support-runtime.ts
```

In another terminal run `node scripts/verify-support-browser.cjs` with Chrome installed and workspace E2E dependencies available. It writes `admin.png`, `widget.png`, and `browser-result.json` under `/tmp/m5kdev-support-execution/`. Stop the fixture and local storage after the run. The fixture intentionally has no Posts/AI provider integration beyond Support's deterministic ports; other Starter example screens are outside this experiment.

## Practical limits

Synthetic providers prove orchestration, authorization, persistence and UI behavior. They do not measure a hosted model's answer quality or translation quality. Overview statistics describe retained data and expose a partial cohort when capped; no SLA or active work-time measurement is claimed. Email ingestion, a React Native widget, WebSockets and the other agreed deferrals remain outside this release.
