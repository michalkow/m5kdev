# Customer-support Core Module scope

Status: accepted. The user invoked spec-to-feature after the final scope review, authorizing implementation in the existing worktree. Tracking: [spec #124](https://github.com/michalkow/m5kdev/issues/124). Research recommendations are not accepted decisions unless recorded below.

Background: [research council synthesis](customer-support-core-module-research.md). Recorded decisions: [ownership](adr/0039-support-cases-are-user-owned.md), [lifecycle dimensions](adr/0040-support-lifecycle-dimensions.md), [required infrastructure](adr/0041-support-reuses-workflow-infrastructure.md). Canonical terms: [glossary](../GLOSSARY.md).

## Agreed boundaries

- Support is an explicitly composed, omittable Core Module.
- The agreed deliverable includes human support, automatic translation and documentation-grounded AI, implemented in stages. Human support works independently; AI answers and translation have separate enable switches.
- Initial contact is limited to signed-in Users. Anonymous visitor support is deferred.
- Each Support Case is private to one User and platform support. Organization context does not grant other Members access.
- Existing platform admins initially handle support through explicit Support grants. A dedicated narrower staff role is deferred.
- A User may open multiple independent Support Cases. The widget lists previous Cases and offers a new-request action.
- Use HTTP for sends, reads and recovery, and the existing SSE stream for change notifications. Synchronize after reconnect. Framework WebSockets are outside this scope.
- Every shipped customer/admin operation needs a complete cross-platform API. A future React Native widget uses that same API.
- Only the in-app communication channel is in scope now. Email is a future extension.
- Include a small operational overview: open, unassigned and waiting Cases, oldest unanswered requests, and first-human-response statistics. Collect detailed historical evidence from the start; advanced reporting and SLA administration are deferred.

## Agreed human-support behavior

- Include public replies, Internal notes, manual assign/take/unassign, priority, Tags, search/filter, saved text replies, secure attachments, unread state and admin-initiated contact.
- Tags and saved replies are shared by platform support rather than personal to each admin. Priorities are low, normal, high and urgent. Personal snippets and macro actions are deferred.
- Defer support teams, automatic routing, macros, typing indicators and presence.
- Keep open/resolved lifecycle, waiting on support/customer/external, snoozed-until and human/AI handling as independent dimensions. Snooze does not automatically pause customer-wait clocks. See [ADR-0040](adr/0040-support-lifecycle-dimensions.md).
- Both the User and platform admins can resolve a Case.
- Any new User message on a resolved Case reopens that same Case and starts a new Resolution cycle, including a reply months later. There is no reopen-expiry window. Users can start separate Cases for new issues.
- Preserve every resolve/reopen event. Automatic inactivity closure is deferred.
- A User message clears snooze, reopens a resolved Case when needed and sets waiting on support. A published admin reply normally sets waiting on User; admins may choose a different waiting reason. Internal notes do not change those dimensions.
- A snooze timer returns an open Case to the active list. It does not reopen a Case resolved before that timer fired.
- Sent public messages are immutable; corrections are new messages.
- Platform admins can redact content with an audited reason. Remove the content from originals and translations and retain a tombstone. Internal notes remain staff-only.
- Attention initially uses widget and Support desk unread indicators. Email and push delivery are deferred; Users see replies when they return.

### Attachments

- Initial formats are JPEG, PNG and WebP images, PDF, and plain-text/log files. Default limits are five files per message and 10 MiB per file, configurable by the app.
- Enforce the actual uploaded size/type before publishing or exposing the attachment; client-declared metadata alone is insufficient.
- Every download requires current Case access. This includes admin-sent Files read by the User and Internal-note Files hidden from that User. Store FileIds and issue authorized short-lived download links through the File integration.
- Redaction revokes further attachment access and removes related derivatives. The storage-access design must account for already issued presigned URLs; removing the application link alone is insufficient.
- Archives, audio/video attachments, OCR, and external malware-scanning integration are deferred.

## Agreed automation and documentation boundaries

- When enabled, AI automatically answers new User requests from approved product documentation, with clear AI identification.
- Always provide a Talk to a person action. A human request, admin takeover, missing evidence or automation failure moves the Case to human handling. AI remains silent until explicitly re-enabled for that Case.
- Use app-configured published product-help documentation, versioned and refreshed with documentation releases.
- Use one platform Support desk across Experiences, preserving Experience context and selecting applicable documentation. Experience does not create another support audience.
- Defer arbitrary website crawling, staff-only knowledge and learning from previous Cases.
- Export a versioned content manifest during the product-doc build, including locale, Experience, canonical URLs and content hashes. Workflow validates/indexes a complete version before activation.
- A failed refresh preserves the previous still-authorized, compatible corpus and exposes the error. Withdrawn content becomes unavailable. Without a valid applicable corpus, AI hands off to humans.
- Admins configure the natively handled locales and fallback translation locale from the app's configured locales. Each admin may choose a working locale.
- Preserve original text and allow additional viewing translations without changing the customer's reply language.
- Start AI automatically only on new User-initiated Cases when enabled. Admin-initiated Cases start human-handled. Publish complete, cited answers; token streaming is deferred.
- AI offers a Resolved action for the User but does not resolve through silence or its own judgment. Human takeover persists across reopening until an admin explicitly re-enables AI.
- Before either automation is enabled, require provider configuration and explicit usage caps, bounded retries/concurrency and per-User abuse limits. App owners choose allowances. Exhaustion disables the affected automation while preserving messages and human support; AI failures hand off, and translation failures remain visible and retryable.
- Customer-language precedence is explicit support-language choice, then recorded language detection, then app UI locale. Permit manual correction and provider-supported message languages beyond the app's UI locales; admin settings use configured app locales.
- Successful outbound translation automatically publishes, with an optional preview before sending. Preserve the authored original and exact published rendition; customers may reveal the original.
- Incoming translation failure leaves the original immediately readable. Outgoing failure holds publication until retry succeeds or the admin explicitly sends the original. Internal notes stay staff-only throughout.
- AI may answer outside human-support hours when enabled. Display configured human hours and a static reply expectation; human requests stay queued. An optional timezone/weekly-hours/holiday calendar preserves revisions. Business-hours reporting and enforced SLA targets are deferred.

## Agreed feedback and data lifecycle

- Include an optional post-resolution CSAT survey using three faces: unhappy, neutral and happy, with one click and no required text. Show it only where a genuine User exchange occurred, including AI-handled Cases.
- One CSAT response per Resolution cycle, changeable while that cycle remains resolved. Reopening retires its unanswered prompt. Positive CSAT is happy responses divided by all responses, with human/AI handling separated. A rating does not itself resolve or reopen anything.
- Measure response times in calendar time to customer-visible publication. First human response includes prior AI time; human-handoff wait is separate. Consecutive User messages do not reset an outstanding reply clock.
- The initial overview shows median, p95, sample count and unanswered count. Preserve lifetime resolution elapsed, accumulated unresolved time and individual Resolution cycles separately.
- Defer active-work tracking, staff occupancy and session monitoring. Historical active handle time remains unavailable; historical CSAT exists only where a survey actually ran.
- User Close blocks User access and pending autonomous replies; admins retain access during the grace period.
- Purge removes linked content, translations, attachments and identifiable case-event/metric history. Initial reports reflect retained data; preserving anonymized historical aggregates is deferred.
- Resolved Cases remain available until Purge or an explicitly configured app retention policy. Legal-hold tooling is deferred.

## Integration and public API

- Support requires Auth, File, Tag and Workflow, including Redis. Apps can omit Support; a reduced no-Redis Support variant and another scheduler are outside scope. Human support works without AI, but still uses the required infrastructure. See [ADR-0041](adr/0041-support-reuses-workflow-infrastructure.md).
- AI answering and translation remain independently enabled. Validate provider/dependency/usage configuration before enabling either; a missing required capability must not masquerade as working automation.
- Use the existing tRPC/service boundaries for the web and publish versioned JSON/OpenAPI coverage for every shipped User/admin operation, including settings, feedback, authorized attachments and automation controls.
- Ship an officially supported Better Auth bearer-session flow for native User clients and verify login, expiry, revocation and reconnect/synchronization with a small reference client. Existing API-key sessions are not a substitute for this deliverable.
- The React Native widget and an Expo-specific integration are deferred. They reuse the same identity, Case history and HTTP contract.
- Persist message acceptance separately from customer-visible publication. Pending translation does not satisfy a response clock.
- Duplicate sends return the original operation; conflicting stale state changes return a conflict. Durable history/change synchronization covers older-message redactions and state changes as well as new messages.
- Pending publications revalidate current authorization, handling mode and source revision. Human takeover invalidates unfinished AI output. Role changes, User Close and redaction cannot be bypassed by stale work.
- SSE carries minimal identifiers, not private transcript snapshots. Subsequent HTTP access checks current authorization. Reconnect/resume recovery must succeed even when notifications were missed.

### Verified integration constraints

- Required module dependencies are checked at boot; optional dependencies may be absent. Support must validate any feature-specific requirements itself. [Module ordering](../packages/backend/src/app.ts)
- Workflow currently requires Redis. Support will reuse that runtime for timed snooze, durable processing and cleanup. [Workflow module](../packages/backend/src/modules/workflow/workflow.module.ts)
- Personal File grants allow platform admins to read User uploads, but do not automatically let a User read an admin-owned File linked to a Support Message. Support needs an explicitly authorized sharing/download seam and authoritative attachment size/count limits. [File grants](../packages/backend/src/modules/file/file.grants.ts), [File service](../packages/backend/src/modules/file/file.service.ts)
- Product documentation serving accepts a static build root; it is not a support-corpus manifest/index-refresh implementation. [Documentation configuration](../packages/backend/src/app.ts)
- Current Tag list/link behavior filters by the calling User or Member. Shared Support Tags need deliberate integration; current endpoints do not automatically supply a platform-wide support taxonomy. [Tag service](../packages/backend/src/modules/tag/tag.service.ts), [Tag repository](../packages/backend/src/modules/tag/tag.repository.ts)
- API-key sessions are enabled, but the inspected Auth setup does not wire bearer/Expo integration. The bearer-session flow is new framework integration to implement and verify, not existing behavior. [Auth setup](../packages/backend/src/modules/auth/auth.lib.ts)

The current [Tag glossary](../GLOSSARY.md) permits User, Member and Organization ownership and explicitly rejects an unplanned fourth model. Shared platform Support Tags therefore require a deliberate reconciliation of Tag storage/access and those domain rules; simply opening all personal Tags or inventing a dummy Organization would not satisfy the agreed boundary. The scope includes that core integration work; its exact representation is an implementation-design task, not a reason to substitute personal Tags.

## Delivery sequence

The complete agreed scope includes all stages. A working human-only intermediate stage does not finish this deliverable.

1. **Foundation and API:** Case/Message contracts, privacy/grants, lifecycle/history and metric events, idempotency, synchronization, required-module composition, versioned HTTP/OpenAPI and bearer-session integration. Keep the human transcript independent of Mastra Memory.
2. **Human support surfaces:** web widget, app-composed Support desk, assignment, waiting/snooze, shared Tags/saved replies, priority/search, authorized attachments, unread state and admin-initiated contact.
3. **Translation:** locale settings, detection/overrides, original and published renditions, optional preview, held failures/retries, usage caps and language provenance.
4. **Documentation AI:** documentation manifest/export/ingestion, applicable retrieval and citations, complete answers, human request/takeover, stale-result prevention, bounded operation and evaluation fixtures.
5. **Operational completion:** overview, three-face CSAT, schedules/availability, retention/redaction/Purge, localized Starter guides and end-to-end acceptance across the earlier stages. Raw events begin in stage 1, not when the overview is built.

Stage 3 and stage 4 have separate enable switches and can be delivered independently once their foundations exist. Do not defer API parity, privacy, operating caps or failure recovery until after their respective feature ships.

## Acceptance criteria

| Area | Observable result required for completion |
|---|---|
| Composition | Support is omittable; missing required infrastructure fails clearly; human support runs with both automation features off. |
| Identity/privacy | Signed-in Users, including those without a usable Organization, access only their own Cases. Other Members and Organization admins gain no access through context. |
| Staff boundary | Existing platform admins use explicit Support grants. Role revocation affects further operations and pending publication. |
| Transcript separation | Internal notes, their Files and derived translations never appear in User APIs, search, sync, events, exports or customer-facing AI context. |
| Human workflow | Separate Cases, manual assignment, priority, shared Tags/replies, search, waiting/snooze, resolve/reopen cycles and admin initiation work through UI and API. |
| Reliable messaging | Duplicate retries do not duplicate messages; concurrent appends survive; stale state edits conflict; reconnect catches missed changes and old-content tombstones. |
| Attachments | Allowed types/counts/actual size are enforced; User/staff downloads obey Case visibility; redaction prevents new access. |
| Translation | Originals and exact published text remain distinguishable; failure cannot silently publish untranslated text or count as a response; an explicit send-original action works. |
| AI | Applicable published documentation produces cited complete replies; unsupported questions hand off; explicit human request/takeover and changed input suppress stale outputs. |
| Automation limits | Configured caps, concurrency and retry bounds hold under failures; disabling/exhausting automation preserves human messaging and queued Case history. |
| Reporting/CSAT | Published human replies determine clocks; unanswered samples are visible; AI/human waits are distinct; three-face one-click ratings follow cycle rules. |
| Privacy lifecycle | Close blocks User/autonomous access; redaction removes content and derivatives; Purge removes identifiable history and linked Files; retained-data reports update accordingly. |
| External clients | Every shipped User/admin operation is documented in the versioned JSON/OpenAPI contract; the native reference client proves User auth and recovery without a React Native widget. |
| Product quality | Widget and Support desk are keyboard-operable, localized, accessible, and have explicit loading/empty/failure states; Starter guides cover the shipped journeys in every configured locale. |

Implementation checks should include real synthetic HTTP/client and local-worker scenarios for cross-User access, note isolation, attachment access, retries/reconnect, takeover races, translation failures, CSAT and Purge. Keep metered providers/production telemetry off; use local fakes for iteration and only bounded explicitly configured provider verification where needed. These are future implementation checks, not tests already run for this planning document.

## Explicit deferrals and measurement limits

- Other communication/attention channels: email ingestion, support email/push notifications, social, SMS and voice.
- Guest support, automatically shared Organization Cases and a dedicated narrower support role.
- React Native widget, Expo-specific integration, WebSockets and AI token streaming.
- Support teams, automatic routing, capacity/occupancy, macros, typing/presence and personal snippets.
- Arbitrary website crawling, staff-only knowledge, learning from Cases and autonomous account-changing AI tools.
- Public-message editing, automatic inactivity closure, reopen-expiry windows, archive/audio/video attachments, OCR and external malware scanning.
- Advanced dashboards, enforced SLAs, business-hours performance reporting, active-handle/session tracking, anonymized permanent reporting history and legal-hold tooling.

Operational history supports future response/wait/assignment/resolution/AI/translation reporting within retained data. It cannot recover active effort never measured, surveys never shown or data intentionally Purged. An inactive SLA cannot be presented retrospectively as an enforced historical commitment.

## Final scope review

Q1–Q34 recommendations are accepted, including the User's one-click smiley-face CSAT requirement. The subsequent spec-to-feature invocation confirmed this consolidated scope.

Schema details, shared Tag ownership encoding, the File authorization/presigning seam, pinned OpenAPI-adapter compatibility, corpus extraction and native session integration remain implementation-design/verification work inside this scope. If one cannot meet the agreed boundary, surface that specific conflict rather than silently reducing the deliverable. Unselected research ideas such as case merging or a separate spam/duplicate-classification console are not added by reference to the research report.

Implementation and tracker publication are now authorized by spec-to-feature. Hosted verification remains subject to the repository usage rules.
