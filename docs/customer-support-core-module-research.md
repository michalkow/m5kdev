# Customer-support Core Module: research council synthesis

Research date: 27 November 2026. Status: research and proposed direction; no implementation or adopted architecture decision.

## Executive recommendation

Build an explicitly composed, omittable **SupportModule** in the Kernel package. It should own a durable **Support Case** and **Support Message** model, an authenticated application widget, a platform-admin Support desk, and a complete API for every shipped operation. Keep documentation-grounded AI answers and bidirectional translation as **independently optional capabilities**. These are coordinator recommendations based on the council's common findings; the repository defines Core Modules as omittable modules shipped in the Kernel package. [Repository instructions](../AGENTS.md), [Glossary](../GLOSSARY.md).

**Do not add framework-wide WebSockets for this scope.** All three researchers recommend ordinary HTTP for writes, reads and recovery, with the existing Kernel SSE stream providing change notifications. This preserves ADR-0010. tRPC subscriptions can themselves use SSE; choosing tRPC subscriptions and choosing WebSockets are different decisions. [ADR-0010](adr/0010-kernel-owns-server-events.md), [tRPC subscriptions](https://trpc.io/docs/server/subscriptions).

**Collect operational history before dashboards.** Keep current-state tables plus a transactionally appended event ledger, immutable message revisions and delivered translations, explicit actor types, resolution cycles, and versioned measurement policies. Zendesk's audits and metric-event APIs demonstrate why update history and clock transitions are separate from a ticket's latest state. The proposed ledger is not a requirement to rebuild the whole product through event sourcing. [Ticket audits](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/), [Ticket metric events](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_metric_events/).

The highest-value early decisions are privacy, message publication semantics, human/AI ownership, supported languages, and clock definitions. A read is not a reply; a database commit is not evidence of recipient delivery; a resolved case is not proof that the customer succeeded. The distinctions below are proposed measurement and API rules, informed by the vendors' different definitions. [Chatwoot message and read APIs](https://developers.chatwoot.com/api-reference/messages/create-new-message), [Chatwoot last seen](https://developers.chatwoot.com/api-reference/conversations/update-last-seen), [Intercom AI outcomes](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes).

## 1. Council, evidence, and scope

### Models and method

Each member received the same complete brief and independently researched the entire topic with web search, page fetch, and read-only repository inspection. They were instructed not to write files, implement code, or spawn further agents. The coordinator compared their returned documents and wrote this synthesis.

| Member | Catalog provider | Catalog model | Reasoning option | Completion metadata |
|---|---|---|---|---|
| Sol 6.1 | Codex: codex | gpt-6.1-sol | reasoningEffort = high | Completed; executedModel reported gpt-6.1-sol |
| Grok 4.7 | Cursor: cursor | grok-4.7 | reasoning_effort = high | Completed under this catalog selection; executedModel was not exposed |
| Claude Opus 5.5 | Claude: claudeAgent | claude-opus-5-5 | effort = high | Completed; executedModel reported claude-opus-5-5 |

Model/run metadata above comes from the local delegation results. No family substitution was needed. The coordinator did not conduct a second research round to resolve disagreements.

**Evidence convention:** linked descriptions of existing products, protocols and repository behavior are findings. Sections explicitly called **proposed** or **recommended** are design judgments, not claims that a vendor implements them or that maintainers have accepted them. Vendor documentation is not a promise of availability on every plan. Some Opus evidence was explicitly search-summary-only; unsupported specifics from those summaries are not used as decisive findings here.

### Requested scope

- One in-app support channel initially, including admin-initiated contact with existing Users.
- Platform admins handle support; Organization admins do not acquire that right.
- An Intercom-like widget, with API parity sufficient for future React Native and other clients.
- Optional answers grounded in platform documentation.
- Optional automatic incoming/outgoing translation, configured from app locales and admins' native languages.
- Standard support operations, plus raw evidence for future metrics and SLA reporting.
- Future inbound email is an extension point, not a current channel.

The AI and translation request is interpreted as two optional capabilities of Support, not a requirement to introduce two additional mandatory Core Modules. This is a proposed scope interpretation.

## 2. Fit with the current framework

| Checked repository behavior | Consequence for the proposal |
|---|---|
| Core Modules live in packages/backend/src/modules and are explicitly composed. Shared contracts belong in commons, reusable client hooks in frontend, UI in web-ui. | Put Support in those established layers; applications may omit it. [AGENTS.md](../AGENTS.md), [Glossary](../GLOSSARY.md) |
| User is personal/global identity; Member is an Organization principal. AdminActor means platform User-role admin. | A private support case should belong to a User, with optional Organization context. [Glossary](../GLOSSARY.md) |
| Conversation means the AI UI transcript; Thread means Mastra Memory. | Use **Support Case**, **Support Message**, and **Support desk** as provisional names; maintainers should resolve terms before implementation. Do not store the human transcript in Mastra Memory. [Glossary](../GLOSSARY.md), [ADR-0007](adr/0007-mastra-thread-over-chats.md) |
| Kernel already serves GET /events through Auth middleware. The bus is User-addressed, Redis Pub/Sub when configured, in-process otherwise, and has no replay. | Reuse its notification role. Support's database/API must recover missed changes. [ADR-0010](adr/0010-kernel-owns-server-events.md), [HTTP bootstrap](../packages/backend/src/app.ts), [Bus implementation](../packages/backend/src/base/server-event.ts) |
| The event envelope carries resource/id/change/organizationId/optional snapshot. Frontend drops non-null Organization tags that do not match the active Organization. | A global Support desk needs deliberate event-tag rules. A null tag may fit personal/global support notifications; Organization context must not make cross-Organization admin updates disappear. [Envelope](../packages/commons/src/modules/base/server-event.schema.ts), [Client filtering](../packages/frontend/src/modules/app/server-event.ts) |
| Module admin routes are app-composed siblings under /admin, reached through sidecar links. | Compose /admin/support explicitly; no import-time route registry. [ADR-0021](adr/0021-admin-panel-sidecar-module-admin.md) |
| trpc-to-openapi 2.3.0 is declared, but the inspected HTTP bootstrap and tRPC metadata do not expose a mounted OpenAPI projection. | A package dependency does not supply a complete external API. Spike the pinned adapter before choosing it. [Catalog](../pnpm-workspace.yaml), [Metadata](../packages/backend/src/utils/trpc.ts), [HTTP composition](../packages/backend/src/app.ts) |
| Auth middleware forwards request headers to getSession; API-key sessions are enabled. The inspected Auth setup does not wire bearer or Expo plugins. | Specify and test native User authentication. Do not infer that bearer login already works, or that native access is impossible. [Middleware](../packages/backend/src/modules/auth/auth.middleware.ts), [API keys](../packages/backend/src/modules/auth/auth.lib.ts) |
| Notification instances and preferences are Member-owned and Organization-scoped. | Personal support attention/unread state does not automatically fit Notification. Do not select an arbitrary Membership merely to send a support alert. [Glossary: Notification](../GLOSSARY.md) |
| File authorization is independent of its parent entity; parent services own attachment cleanup. | Design support-specific File access for the customer and authorized staff. A case link alone grants no download access. [ADR-0030](adr/0030-file-is-inventoried-s3-object.md) |
| AI provides vectors and usage plumbing. embedDocument currently implements text only despite accepting other types in its signature. | Documentation ingestion needs a verified extraction pipeline; AI infrastructure is not a ready support corpus or citation system. [AI module](../packages/backend/src/modules/ai/ai.module.ts), [embedDocument](../packages/backend/src/modules/ai/ai.service.ts) |
| User/Organization Close, Restore and Purge have different meanings. | Define support cleanup and cancellation across those lifecycle operations. [ADR-0031](adr/0031-close-restore-purge.md) |

**Recommended composition:** Support owns support policy and orchestration. Repository methods own persistence, transports validate inputs and delegate, jobs call services, and services declare explicit dependency maps. Use existing grants and ServerResult patterns. AI, retrieval, translation, File, Workflow and notification dependencies should be explicit, with boot-time capability validation. Human support must remain usable when either automation capability is disabled. [Repository layer and composition rules](../AGENTS.md), [Module dependency hooks](../packages/backend/src/base/base.module.ts).

## 3. Standard support capabilities and sensible boundaries

Intercom documents assignment, customer context, priority, snooze, views, and admin-initiated contact. Zendesk distinguishes waiting on the requester from waiting on a third party and provides optimistic-update protection. Chatwoot documents private notes, labels, canned responses and macros. These are useful baseline references, rather than a reason to clone an entire product. [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained), [Outbound contact](https://www.intercom.com/help/en/articles/6433002-start-a-conversation-from-the-inbox), [Zendesk lifecycle](https://support.zendesk.com/hc/en-us/articles/8263915942938-About-the-ticket-lifecycle-and-ticket-statuses), [Safe updates](https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/), [Chatwoot core features](https://www.chatwoot.com/hc/user-guide/articles/1677235281-lesson-3-a-mastering-core-features).

The following is **proposed phasing**, with data requirements applying as soon as the relevant behavior ships.

| Area | Initial usable release | Preserve now for later | Defer |
|---|---|---|---|
| Customer widget | Launcher, case list, transcript, composer, unread state, retry/error states, human-request action, availability information | Client kind/version, case origin, locale decisions, accepted/published times | Custom branding designer, proactive campaigns |
| Support desk | Mine/unassigned/all-open views; requester context; search/filter; manual assign/take | Assignment/priority/tag history; actor and assignee at event time | Teams, capacity and skills routing, round robin |
| Collaboration | Public reply and clearly separate internal-note mode; stale-update conflict handling | Note visibility, revisions, redaction actor/reason | Presence avatars, typing, mentions, side conversations |
| Lifecycle | Resolve/reopen; waiting responsibility; snooze with explicit wake rules | Every state interval, resolution cycle, reason and actor | Arbitrary workflow/macro builder |
| Message content | Text and bounded formatting; safe rendering; attachment support once access is proven | Revision, source, author/approval provenance, exact published rendition | Audio/video, arbitrary HTML, document OCR/translation |
| Read state | Monotonic per-User viewed cursor; unread badge | Receipt semantics and optional timestamps | Fine-grained device delivery guarantees |
| Organization | Priority and Tags where ownership fits; basic saved text replies if scope permits | Dimension changes, snippet revision if used | Macro actions, custom-field designer |
| Outbound contact | Admin starts a case for an existing User; shows it in the widget | Admin origin, first customer reply, purpose/context | Bulk outreach and campaigns |
| Satisfaction | Optional small post-resolution survey | Invitation/display/answer, cycle, scale and attribution | Survey designer and advanced reporting |
| Operating hours | Static availability/reply expectation, versioned schedule when configured | Schedule revisions, IANA timezone and exceptions | Dynamic predicted wait and staffing forecasts |
| Governance | Rate and size limits, privileged redaction, access checks, retention | Audit facts and exclusions for test/spam/duplicates | Large moderation/QA console |
| Metrics | Event history and bounded export/basic operational counts | Everything in section 9 | Reporting dashboards and advanced SLA administration |
| Channels | In-app only | Source channel and future external-reference seam | Inbound/outbound support email, social, voice, SMS |

**Proposed lifecycle model:** keep open/resolved lifecycle separate from waitingOn = support/customer/external, snoozedUntil, handling mode = AI/human, and nullable assignment. This expresses “open, human-handled, waiting externally, snoozed until tomorrow” without overloading one status. Opus and Grok instead proposed combined status enums; that alternative remains documented in section 11.

**Proposed default transitions:** an eligible customer message wakes snooze, sets waiting on support, and reopens a resolved case into a new cycle. A human reply can set waiting on customer. Snooze changes work visibility, not automatically the customer's wait or an SLA. Customer self-resolution, late-message windows, spam/duplicate dispositions and abandonment need product decisions. Vendor status names are not interchangeable: Zendesk Pending is waiting for the requester, while Chatwoot has a different open/pending/snoozed/resolved workflow. [Zendesk status guidance](https://support.zendesk.com/hc/en-us/articles/4408843029658-About-open-vs-pending-and-on-hold-tickets), [Chatwoot status API](https://developers.chatwoot.com/api-reference/conversations/toggle-status).

**Proposed accessibility acceptance:** keyboard-operable launcher/composer/actions; sensible focus on open/close and pagination; a polite message log; labeled attachments; internal notes distinguishable beyond color; localized strings and RTL-ready layout. WCAG and ARIA define keyboard and status-message requirements and a log role suitable for messaging. No council member audited vendor accessibility or this future UI. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [ARIA log](https://www.w3.org/TR/wai-aria-1.2/#log), [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## 4. Proposed domain, privacy, and durable records

### Ownership and authorization

Start with **one requester User plus authorized platform support staff**. Organization context describes the issue; it does not expose the case to every Member, Owner, or Organization admin. Assignment is workload ownership, not an authorization mechanism. This proposal follows the framework's User/Member/AdminActor distinctions. [Glossary](../GLOSSARY.md).

Customer operations derive the requester from authentication. An arbitrary userId, email or organizationId cannot establish access. Admin initiation may name a target User through an authorized service operation. Internal notes must be omitted server-side from customer responses, search, deltas, events, attachments, exports and customer-facing AI context. All transports should call the same services and enforce the same canonical grants. These are proposed invariants under the repository's authorization rules. [AGENTS.md](../AGENTS.md).

### Records worth owning

All rows below are a **proposed model**, not an approved schema.

| Record | Essential information |
|---|---|
| Support Case | Requester UserId, optional Organization/Experience context, origin/direction/channel, lifecycle, waiting responsibility, assignee, priority, snooze, handling mode, version, creation/activity timestamps |
| Support Message | CaseId, stable message order, author category/identity, public/internal visibility, source channel, reply-to, acceptedAt, publishedAt, current revision, source client message ID |
| Message revision | Immutable authored body/version, editor, reason, declared and detected language evidence, redaction state |
| Published rendition | Exact text and language made visible to the customer, source revision and translation/approval references |
| Attachment link | Message/revision and FileId, visibility, ownership/access relationship |
| Read cursor | CaseId + reader UserId + highest viewed message position; monotonic updates |
| Case event | Ordered domain fact, cycle/episode, actor, timestamps, before/after facts and correlation |
| Durable work intent | AI/translation/wake/notification action, dedupe key, attempts, lease and terminal outcome |
| AI run | Trigger revision/epoch, corpus/source revisions, prompt/configuration, model, usage, latency, result |
| Translation artifact | Source revision, language decision, target, provider/config/glossary/context version, exact result, usage and status |
| Schedule/SLA version | Immutable calendar/target/pause definition and effective policy history |
| Survey/response | Case/cycle, scale/version, invitation/display/answer times, respondent and rating attribution |

Do not persist presigned URLs or S3 keys as attachment identifiers: the existing File contract uses FileIds. A support download path must prove both case visibility and correct File authorization, including customer-uploaded files read by staff, staff-uploaded public files read by the requester, and internal-note files excluded from customers. Deletion must cover related Files and derived artifacts. [ADR-0030](adr/0030-file-is-inventoried-s3-object.md).

**Proposed retention:** closing a User blocks their access and invalidates pending autonomous publications; Restore does not resume stale jobs automatically. Purge policy must cover originals, revisions, translated renditions, Files, indexes, provider traces and exports. Store no transcript bodies in metric events. Decide whether any deidentified aggregates survive Purge; an append-only ledger is still subject to governed deletion. The research does not choose a legal retention period or legal-hold rule. [Auth lifecycle](adr/0031-close-restore-purge.md).

## 5. Complete API, reliability, and synchronization

### Release contract

**Recommendation:** make public API coverage an acceptance criterion for the initial module release, rather than a later project. Every shipped customer and admin operation should have a documented authenticated HTTP contract, even if the React implementation uses tRPC. This follows the user's explicit cross-platform requirement; it is stronger than the later/minimal API phases proposed by Opus and Grok.

Proposed API groups:

| Group | Operations to cover when the behavior ships |
|---|---|
| Discovery | Enabled capabilities, limits, effective support languages and availability |
| Cases | Create/list/get, admin-initiated contact, search/filter, participant/context access |
| Transcript | Bounded history, change synchronization, send, allowed edit/redaction, revisions |
| Workflow | Assign/take/unassign, priority/Tags, waiting reason, snooze/wake, resolve/reopen |
| Read state | Advance own cursor, unread projections |
| Files | Initiate/finalize/link, authorized download, detach/delete |
| Automation | Request human, takeover, AI/translation status, language override/retry/correction/approval |
| Configuration | Authorized settings, schedules, capability and budget status |
| Feedback/audit | Submit satisfaction, privileged event history and bounded export |

A provisional path is **/api/v1/support**; path versus header versioning remains an implementation choice. Share Zod contracts and service behavior. The OpenAPI adapter requires explicitly exposed procedures, output schemas, route metadata and a mounted handler; transformers and input shapes need checking against the pinned version. If the adapter cannot represent an operation, use a thin Express route calling the same service. Do not duplicate business logic. [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi), [Transport boundaries](../AGENTS.md).

**Proposed wire contract:** stable error code/request ID, safe validation details, explicit conflict/cursor-expiry/quota errors, bounded page/body/File sizes, string IDs/cursors, explicit timestamps, documented enum evolution and retry semantics. RFC 9457 is an option for the REST boundary; preserve framework errors inside services. Return 429 and appropriate retry information for rate limits. Do not copy a vendor's quota numbers. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457), [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585).

### Authentication across clients

Use existing cookie sessions for the web. Select a supported, revocable **User** credential flow for native clients; do not embed platform-admin credentials or invent a caller-supplied userId trust scheme. Better Auth documents bearer and Expo integration options. Neither is proof of an already working native flow in this repository. API-key session support exists, but an integration key is not automatically the right mobile end-user credential. Test expiry, logout, revocation, Close, role changes and SSE reconnect using the selected mechanism. [Bearer plugin](https://better-auth.com/docs/plugins/bearer), [Expo integration](https://www.better-auth.com/docs/integrations/expo), [Current Auth setup](../packages/backend/src/modules/auth/auth.lib.ts).

### Proposed write semantics

1. Authorize the operation and resolve its idempotency key.
2. Serialize relevant writes on the case; check expected version for conflicting state changes.
3. Allocate monotonic case-local message/change order.
4. Write the revision/publication or transition, current projection, metric fact and required work intent in the same PostgreSQL transaction.
5. Commit, return authoritative state, then notify other affected Users.

Concurrent message appends can both succeed. A stale assignment or resolution must not silently overwrite a colleague's change. PostgreSQL row locks and Zendesk's safe-update example support these patterns. A bare global sequence does not establish commit-order visibility for synchronization. [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html), [Sequences](https://www.postgresql.org/docs/current/sql-createsequence.html), [Zendesk safe updates](https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/).

**Proposed idempotency:** scope keys by authenticated actor, operation and case; return the original result for identical retries and a conflict for changed payloads. Keep client-message identity for the message's supported retry lifetime, including long-offline native sends. Document retention explicitly. A correlation/optimistic-UI ID is not a deduplication guarantee. Stripe's documented parameter comparison is a useful precedent, not a required expiry choice. [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

**Separate acceptance from publication.** A translated admin reply may be accepted but not yet customer-visible. Store both instants. Translation failures must not satisfy response metrics. “Fetched,” “client acknowledged,” and “read” require their own evidence; SSE emission or database commit does not prove them. These are proposed semantics that resolve a council disagreement.

### Proposed recovery contract

Maintain **message order** separately from **change order**. Fetching messages after message 20 does not discover an edit or redaction to message 10. A case delta must include new messages, revisions, tombstones and relevant workflow changes, or explicitly require an authoritative resync covering those changes. This is a coordinator refinement of the simpler afterSequence proposals.

Use bounded keyset history, an opaque case-local change cursor, next cursor and an explicit expired-cursor/resync error. Establish an initial snapshot boundary and then synchronize changes after it. Customers receive only authorized public changes. Message/change IDs make duplicates harmless; hidden internal entries must not be interpreted as missing public messages. A cursor's progression must remain correct under concurrent commits and visibility filtering.

Refetch the admin case list on relevant events, reconnect and foreground resume. Do not present a mutable list's pagination cursor as a durable global change feed. Zendesk warns that its ticket audit listing is not a suitable incremental export mechanism. [Ticket audit limitations](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/).

Use durable outbox/work intent for AI, translation, scheduled actions and important attention notifications. At-least-once dispatch requires idempotent effects and a recovery sweeper. SSE itself can remain a best-effort hint; outbox dispatch does not add disconnected-client replay. Preserve immutable domain facts separately from mutable retry/lease bookkeeping, even if delivery references event IDs. [Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

### Future email seam

Store channel = in_app now, transport-independent reply-to relationships, external references when needed, and source received time separately from claimed client/external time. Future inbound email needs verified identity, threading, recipient privacy and provider-event deduplication. Message-ID, In-Reply-To and References are the relevant email concepts; matching a From address or subject must not grant transcript access. Do not build mailbox/MIME/ingest infrastructure now. [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4).

## 6. Realtime decision

The council unanimously recommends **existing Kernel SSE + HTTP**. SSE provides one-way events and reconnect mechanics; tRPC offers SSE and WebSocket transports. Neither tracked IDs nor WebSocket connections create a durable history store. Redis Pub/Sub can lose messages for disconnected subscribers. [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html), [tRPC subscriptions](https://trpc.io/docs/server/subscriptions), [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics).

| Option | Proposed assessment |
|---|---|
| Existing Kernel SSE plus HTTP | Best fit. Reuse one credentialed stream and current infrastructure; HTTP is the truth and recovery path. |
| tRPC subscription over SSE | Technically valid; a second subscription API needs a reason and an ADR review. It does not solve persistence or native auth. |
| tRPC over WebSocket | Useful only if a real duplex requirement emerges; still needs authorization, recovery and durable storage. |
| Standalone WebSocket protocol | Most additional protocol ownership: subscription/auth/reconnect/flow control/versioning. Defer. |

The first choice preserves ADR-0010, which rejects WebSockets/tRPC subscriptions for resource-change notification. A future adoption should explicitly revisit that ADR, not silently introduce a parallel Kernel protocol. [ADR-0010](adr/0010-kernel-owns-server-events.md).

**Proposed event behavior:** minimal support.case/support.message identifiers, sent through Auth to explicitly authorized UserIds. Notify the requester and eligible support staff; avoid bodies and internal-note snapshots. Recipient selection must follow support authorization, not Organization membership or assignment alone. Redis is required for correct cross-instance/worker fanout in the existing design; without it, document the single-process live-notification limit while keeping HTTP correct. [ADR-0010](adr/0010-kernel-owns-server-events.md), [Auth emit helpers](../packages/backend/src/modules/auth/auth.service.ts).

For native clients, foreground SSE needs a tested implementation: React Native documents Fetch/WebSocket, and tRPC documents native SSE compatibility concerns. Synchronize on launch, successful reconnect and foreground resume, with polling fallback. Use push for background attention if included later; mobile background execution and delivery constraints mean neither an open socket nor push receipt is transcript truth. [React Native networking](https://reactnative.dev/docs/network), [AppState](https://reactnative.dev/docs/appstate), [tRPC native compatibility](https://trpc.io/docs/client/links/httpSubscriptionLink#compatibility-react-native), [Android Doze](https://developer.android.com/training/monitoring-device-state/doze-standby), [Apple background pushes](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app).

**Revisit WebSockets only with evidence:** sustained high-frequency duplex interaction, collaborative editing, voice/media signaling, or a demonstrated supported-client/deployment limitation. No council member measured such a need. Typing/presence can be deferred; if added, use bounded ephemeral behavior without treating it as an authorization lock or durable event.

## 7. Optional documentation-grounded AI

Fin's content/audience controls, multilingual retrieval and escalation illustrate the separate concerns: allowed knowledge, applicable language, answer publication and human handoff. Prompt injection can arrive through user input and retrieved content; prompting alone is insufficient isolation. [Fin sources](https://www.intercom.com/help/en/articles/7837514-add-your-content-for-fin-ai-agent), [Audience rules](https://www.intercom.com/help/en/articles/9357948-manage-audiences-for-fin-and-copilot), [Multilingual setup](https://www.intercom.com/help/en/articles/8322387-set-up-fin-ai-agent-s-multilingual-support), [Escalation](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules), [OWASP prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

The following is a **proposed AI contract**:

- Opt in through composition and settings; require a usable corpus, model configuration and budget. AI off must leave human messaging intact.
- Start with explicitly approved platform documentation. Record source ID, canonical URL, product/release/Experience applicability, locale, visibility, checksum, published/fetched/indexed/withdrawn times, chunk/index/embedding versions and refresh errors.
- Activate corpus generations consistently; retain answer-time source revisions. Filter by audience, product/version and locale before retrieval. Do not index other Users' cases, internal notes or attachments.
- Persist citations linking to documentation the customer can access. Preserve retrieved chunk IDs/scores and source versions internally. Prefer same-language sources with a deliberate fallback.
- Keep customer/retrieved text untrusted; no arbitrary account tools, refunds, browsing or mutation permissions in the first slice. Enforce source access in code and sanitize output.
- Offer a deterministic **Talk to a person** action through widget and API. Escalate on user request, unavailable evidence, repeated failure, sensitive-topic policy, provider error, budget exhaustion or admin takeover.
- Make AI identity clear. Distinguish waiting for a human from actively staffed support, particularly outside hours.
- Persist a generation epoch/input revision. Immediately before publication, transactionally verify it, handling mode, access and case state. Human takeover or changed input invalidates stale runs; late answers are discarded.
- Record published/abstained/failed/cancelled/superseded/handoff outcomes, prompt and model versions, retrieval references, latency, tokens/units, provider request IDs and estimated versus actual cost.
- Maintain a hard kill switch, per-case suppression, turn/concurrency/time/retry limits, and shared budget reservation/reconciliation. Automation exhaustion must not block human support.

**Proposed evaluation:** answerable, unanswerable, outdated/conflicting-source, multilingual, injection, access-isolation and takeover-race fixtures; measure groundedness, citation correctness and escalation behavior. A self-reported model confidence or raw retrieval score is not a calibrated safety threshold. No model or provider was evaluated by this council; thresholds remain open.

AI-generated drafts explicitly reviewed and published by staff should retain human approval and AI-assistance provenance. Unattended AI sends remain AI even if a staff account or translation service participates. This is necessary for the proposed human-response metric distinction.

## 8. Optional bidirectional translation

Intercom separates teammate translation preferences from customer language and Fin's multilingual answers. Chatwoot shows originals and translated replies, with its own fallback behavior. Those products provide precedents for the experience, not a universal send policy. BCP 47 defines language tags, and translation services can distinguish explicit source language from detection. [Intercom translation](https://www.intercom.com/help/en/articles/10545610-how-to-use-ai-inbox-translations), [Translation behavior](https://www.intercom.com/help/en/articles/16296591-understanding-translation-behavior-in-intercom), [Chatwoot translation](https://app.chatwoot.com/hc/user-guide/articles/1792447465-auto_translate-conversations), [RFC 5646](https://www.rfc-editor.org/rfc/rfc5646), [Azure translation API](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate).

### Proposed settings and language resolution

Keep app UI locale, explicitly chosen support language, detected message language, effective customer delivery language, admins' native locale set, default translation target, per-admin working preference, and provider-supported language mapping separate.

Use the configured **app locales** to select admins' natively handled languages and their fallback target, as requested. Store canonical language/script/region tags and explicit provider mappings. A supported app locale does not prove that a translation engine supports the corresponding language pair.

**Recommended precedence:** explicit customer support-language choice wins; otherwise use a recorded detection decision, with UI locale as a disclosed fallback. Preserve uncertain/mixed/unknown outcomes and allow correction. Admin UI language must not silently change customer delivery. The council disagreed about precedence; this is a recommendation rather than consensus.

Example proposal: app locales en/pl/de; admins natively handle en/pl; default target pl. A German customer's original stays German, admins get a Polish rendition, and a Polish-authored staff reply is published in German. An English-preferring staff member can request an English viewing rendition without changing the customer's delivery language.

### Proposed processing and evidence

**Inbound:** persist the original and make it available immediately; record language evidence; translate for the default team target when needed. Show original plus rendition and its status/provenance. Permit optional per-admin viewing translations.

**Outbound:** accept the authored source, freeze the effective target for that send, translate if needed, persist the exact customer rendition, then publish. An incoming failure leaves the original readable. An outgoing failure holds the reply and offers bounded retry or an explicit send-original choice; never silently claim a translated reply was delivered.

Translation identity should include source revision, language-decision version, target, provider/model/engine configuration, glossary and relevant context version/hash. Persist produced text, attempt outcome, queue/provider/review/publication times, units and cost. A manual correction creates a new artifact. A published correction must remain an observable correction, not a silent historical replacement.

Protect code, URLs, product names, formatting and quoted identifiers through an evaluated translation contract. Internal-note translations stay internal in every API, event and export. Translate text only initially; file bytes/OCR/audio are separate future capabilities.

Prefer generating a grounded AI answer directly in the customer's effective language. When another generation language is necessary, translate once through the same publication pipeline. Record retrieval, generation, delivery and admin-view languages independently. Translation does not change whether the message was human- or AI-authored.

Quality reporting should use reviewed samples, severity and a versioned rubric; corrections/retries are operational signals, not proof of the true error rate. Keep language-pair failures, cache hits, billable failures/retries and budget exhaustion visible. No engine, glossary requirements or quality threshold was selected by the council.

## 9. Metrics: definitions and raw evidence to collect now

### 9.1 Why vendor labels cannot be copied

Zendesk distinguishes first reply, first resolution, full resolution, requester wait, agent wait, and on-hold time. Its SLA rules have their own restart and pause behavior. [Zendesk metric definitions](https://support.zendesk.com/hc/en-us/articles/4408827693594-Metrics-and-attributes-for-Zendesk-Support), [Zendesk SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies).

Intercom exposes response-time variants with or without bot time and office hours. Its reporting FAQ distinguishes a standard response clock from the SLA clock’s activation point. [Intercom reporting metrics](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes), [Intercom reporting FAQ](https://www.intercom.com/help/en/articles/8921906-reporting-faqs).

Chatwoot documents further differences: first-response clocks may start later after reopening or bot handoff; resolution counts include repeated resolutions; some attribution follows the current assignee rather than the person who performed the action. [Chatwoot reporting calculations](https://app.chatwoot.com/hc/user-guide/articles/1795601793-how-reports-work-controls-metrics-and-who-gets-credit-eedd870e).

**Recommendation:** publish a versioned metric dictionary. Store raw evidence sufficient to compute multiple honest definitions, and give each report an explicit cohort, clock, eligibility rule, and attribution rule.

### 9.2 Proposed measurement rules

The following are **m5kdev metric proposals**, not claims about vendor implementations.

Define actors independently of account identity:

- `customer`
- `human_admin`
- `ai`
- `automation`
- `system`

Also record assistance and approval: a human explicitly reviewing and publishing an AI-assisted draft may count as a human response, while an unattended automated send using an admin identity must not.

Define eligible customer messages as customer-authored, public, successfully published messages, including attachment-only messages. Exclude control actions and system-generated entries. Exclude test/spam/duplicate cases only through explicit recorded classification.

Define an eligible human reply as a public, customer-visible publication authored or explicitly approved by a human admin. Internal notes, reads, assignments, typing, acknowledgements generated by automation, and pending translations do not qualify.

Use server publication times for response clocks. Preserve acceptance time separately to measure processing/translation delay.

### 9.3 Proposed metric derivation table

Let:

- `C₀`: first eligible customer message on the case.
- `H₀`: first eligible human reply after `C₀`.
- `Oᵢ`: opening/reopening of resolution cycle `i`.
- `Rᵢ`: resolution of cycle `i`.
- `Wⱼ`: oldest outstanding eligible customer message in response episode `j`.
- `Hⱼ`: next eligible human reply satisfying that episode.
- `T`: reporting cutoff.

All intervals below are calendar time unless explicitly business-time variants.

| Metric | Proposed formula / start and end | Eligibility, reopen, and pause rules | Required evidence |
|---|---|---|---|
| First human response, lifetime | `H₀ − C₀` | Once per case; outbound creation does not start it. No bot/translation/read event stops it. Does not reset on reopen. Includes intervening time; label clearly. No `H₀` means unanswered/censored, not zero. | First customer publication, first human publication, author/approval provenance |
| First human response per cycle | First eligible human publication after the first eligible customer publication in that cycle, minus that customer publication | Only cycles containing customer input. Resets on reopen. No automatic pause for AI or snooze. | Cycle IDs and ordered publications |
| Human response after handoff | First human publication after human-help request minus human-help request | Separate from original customer wait. Repeated handoffs are distinct episodes. Report still-waiting episodes. | Handoff requested/routed/accepted, human publication |
| Next human response | `Hⱼ − Wⱼ`, after the initial response | Consecutive customer messages do not reset `Wⱼ`. AI and notes do not satisfy it. Resolution/withdrawal cancels an outstanding episode with an explicit outcome; do not count it as a response. Reopen creates a new episode. | Response-obligation opened/satisfied/cancelled events |
| Outstanding human-answer wait | `T − Wⱼ` for an active episode | Measures current unanswered demand. Keep separately from completed reply-time distributions. | Active obligation projection and original event |
| Customer-wait state time | Sum of open intervals with `waitingOn = support` or `external` | Excludes waiting on customer and resolved intervals. AI handling counts unless the chosen named variant explicitly excludes it. Snooze alone does not pause it. | Waiting-state transitions |
| Admin-wait state time | Sum of open intervals with `waitingOn = customer` | Ends on customer reply or explicit state change. Resolved intervals excluded. This is elapsed waiting, not labor. | State transitions, customer publications |
| External-wait time | Sum of `waitingOn = external` intervals | Expose separately, even if also included in customer-wait time. | State and reason transitions |
| First resolution elapsed | First `Rᵢ` minus first opening | Once per case; include all elapsed time. Record resolver category/disposition. Exclude or separately report administrative spam/duplicate closures. | Open and first resolved events |
| Full resolution elapsed, as of cutoff | Latest qualifying `Rᵢ − O₀`, only if resolved at `T` | Includes earlier resolved gaps. If reopened at `T`, report open/censored rather than a completed full-resolution result. Never claim permanent finality. | Every resolve/reopen event, cutoff |
| Active unresolved duration | Sum of open cycle durations through `T` | Excludes resolved gaps. Provide waiting-state breakdown rather than silently removing them. | Cycle intervals |
| Resolution-cycle time | `Rᵢ − Oᵢ` | One sample per completed cycle; open cycles censored. Separate initial from reopened cycles. | Cycle IDs and boundaries |
| Time to first assignment | First human assignment minus first human-queue entry | Do not start at admin outbound creation unless it enters a queue. Bot ownership is separate. No pause for snooze. | Queue entered and assignment events |
| Queue residence | Sum of each queue-entry to queue-exit interval | Re-entry creates a new interval. Preserve source/destination and reason. | Queue transition events |
| Assignment-to-response | First human publication during assignment episode minus assignment time | Reassignment closes/censors that episode. Attribute sender and assignee separately. | Assignment intervals and publication actor |
| Backlog | Count of qualifying open cases at `T` | Slice waiting, priority, queue, unassigned, AI/human. Resolved cases excluded. | Historical lifecycle projection from events |
| Backlog age | `T − Oᵢ` for current open cycle; also expose lifetime age | Distinguish unresolved-cycle age from time since original creation and time since customer demand. | Original and current-cycle opening |
| Active handle time | Sum of measured active-work intervals | Requires explicit instrumentation or manual time entry. Deduplicate overlapping intervals per admin; distinguish staff-minutes from case elapsed union. No inference from assignment alone. | Active start/stop/idle/heartbeat or approved time entry |
| Volume | Cases created and messages published within period | Separate inbound/outbound, author category, public/internal, and test/spam exclusions. Reopen is not a new case. | Creation/publication events |
| Throughput | Completed qualifying resolution cycles, plus distinct cases resolved | Show both counts; one repeatedly resolved case can produce multiple cycle completions. | Resolve events and case/cycle IDs |
| Transfers | Count changes between non-null human assignees/queues | Initial assignment and unassignment are separate categories. Preserve reason. | Before/after assignment events |
| Reopen rate | Mature resolved cases with a subsequent reopen within window ÷ mature resolved cases | Fix window and cohort. Exclude right-censored cases lacking full observation. Also report reopen event count. | Resolve/reopen history and observation cutoff |
| CSAT | Positive valid responses ÷ valid responses, for a versioned scale | Respondent must be authorized customer; fix positivity threshold. Preserve all ratings and survey cycle. No response is not negative or positive. | Survey and response records |
| CSAT response rate | Answered eligible survey invitations ÷ eligible invitations | Use the same cohort/filter/window in numerator and denominator. Deduplicate invitations and response revisions. | Issued/displayed/answered timestamps |
| AI answer rate | Eligible AI episodes with at least one substantive answer published ÷ eligible AI episodes started | Greetings, clarification-only messages, failures, and unpublished generations remain separate. | AI episode and publication classifications |
| Confirmed AI resolution | Customer-confirmed resolved AI episodes with no human contribution during defined episode/window ÷ mature eligible AI episodes | Record confirmation mechanism; a classifier inference is not equivalent to explicit feedback. Reopen invalidates/reclassifies under the stated window. | AI answer, customer confirmation, human-touch, reopen events |
| Inferred AI containment | Mature AI episodes with an answer and no handoff/human contribution/reopen during observation window ÷ mature eligible AI episodes | Call it inferred containment; silence may be abandonment. Report confirmed and inferred separately. | Observation deadline, handoff/touch/reopen/outcome |
| Translation delay | Outbound publication minus translation-ready/send acceptance; break into queue/provider/review time | Failed/pending items are censored or failure outcomes, not zero latency. | Accepted, queued, requested, completed, approved, published times |
| Translation cost | Sum of billable usage by message/revision/language pair | Include retries and failures when billed. Separate estimated/actual and cache hits. | Provider attempts, units, prices/config versions |
| Translation quality | Reviewed artifacts with defined errors ÷ reviewed artifacts; correction/retry rate separately | Report sample selection, language pair, severity and reviewer. Model confidence is not quality ground truth. | Review/correction events and rubric version |
| Human escalation rate | Eligible AI episodes requesting human help ÷ eligible AI episodes | Count episodes once; split customer request, policy, failure, budget and staff takeover. Open episodes remain visible. | AI episode, handoff reason and timestamps |
| SLA attainment | Fulfilled targets completed by deadline ÷ fulfilled or breached eligible targets | Report active overdue, cancelled and unavailable targets separately; policy determines pauses and reopen behavior. Fulfillment after breach remains a breach. | Versioned SLA instance, clock segments, deadline, fulfillment and breach facts |

### 9.4 Business hours, timezones, and DST

Chatwoot documents inbox-specific timezone schedules and business-hours reporting. Its current reporting documentation also illustrates a hazardous edge case: an inbox without configured business hours can contribute zero business-time values. [Business hours](https://app.chatwoot.com/hc/user-guide/articles/1777421876-business-hours-and-auto_responder), [Reporting calculations](https://app.chatwoot.com/hc/user-guide/articles/1795601793-how-reports-work-controls-metrics-and-who-gets-credit-eedd870e).

**Proposed business-time definition:**

```text
business_duration(start, end, schedule_version)
  = total elapsed seconds in
    [start, end)
    ∩ expanded UTC working intervals
    − explicitly permitted pause intervals
```

Store:

- UTC event instants.
- IANA timezone identifier.
- Weekly local working intervals.
- Holiday/exception dates.
- Schedule ID/version and effective period.
- The rule used for ambiguous/nonexistent local times at DST transitions.
- Optionally the expanded intervals used for a finalized measurement.

**Recommendation:** freeze schedule interpretation for metric/SLA instances. A schedule edit must not silently rewrite historical performance. Missing schedule should mean explicit calendar fallback or unavailable measurement, never a fabricated zero.

### 9.5 SLA instances and pauses

Zendesk’s SLA documentation shows that response, periodic-update, and resolution targets have different activation, pause, and reopening behavior; some configured autoreplies can satisfy reply targets. These differences reinforce the need for a module-specific policy contract. [Zendesk SLA policy definitions](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies).

**Proposed SLA instance fields:**

- Policy ID/version and metric-definition version.
- Case/cycle/response-episode ID.
- Activation reason and timestamp.
- Target duration and calendar/business basis.
- Schedule version.
- Priority/segment snapshot.
- Allowed pause reasons.
- Pause/resume segments.
- Deadline, fulfillment time, breach time.
- Fulfilling message/actor category.
- Cancellation/supersession reason.
- Policy-reapplication history.

Recommended initial rules:

- First-human-response SLA starts at eligible customer input or explicit human-queue entry—choose and name which.
- Human reply SLAs never stop on AI/automation unless a separately named policy explicitly permits it.
- Snooze and reassignment do not erase elapsed time.
- Waiting on customer may pause a resolution SLA if the policy permits.
- Waiting on an external team should remain visible even if an internal target pauses.
- Reopening starts a new reply target.
- A resolution target either resumes accumulated unresolved time or starts a new cycle target; choose explicitly.
- A customer reply cancels a customer-wait pause.
- Priority/policy changes create recorded transitions, not historical overwrites.

Report achieved, breached, active, cancelled, and unavailable separately. A completed-only success ratio hides active overdue work.

### 9.6 Handle time is not assignment time

Zendesk describes handle time as time an agent spends working and uses a Time Tracking app to capture it. [Zendesk efficiency metrics](https://support.zendesk.com/hc/en-us/articles/4408832234394-Analyzing-the-metrics-that-matter-to-improve-customer-support).

**Recommendation:** initially report “assigned open duration” if that is all the module can substantiate. Do not call it active handle time.

If active work will matter later, introduce bounded work-session evidence now:

- Case and admin.
- Session/device identifier.
- Focus/activity start.
- Idle/blur/stop.
- Heartbeat and expiry.
- Measurement method/version.
- Manual corrections with reason.

A missing stop event must expire, not create days of fabricated labor. Metrics should identify instrumented coverage and inferred intervals. **If active-work instrumentation is deferred, historical active handle time will remain unavailable; adding a nullable field now cannot recover it later.** The same limitation applies to unsent CSAT surveys and unrecorded policy decisions.

### 9.7 AI resolution is not equivalent to silence

Intercom explicitly distinguishes confirmed and assumed resolutions, and its documentation discusses cases where later requests alter outcome classification. [Fin outcome definitions](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes).

**Recommendation:** retain distinct facts:

- Answer published.
- Customer explicitly confirmed.
- Customer gave negative feedback.
- Human requested.
- Human contributed or approved.
- Inactivity timeout occurred.
- Case was administratively resolved.
- Customer returned/reopened.
- Observation window matured.

A resolved case is a workflow state. A successful customer outcome requires additional evidence.

### 9.8 Aggregation and attribution

**Proposed reporting rules:**

- Show sample count and unanswered/censored count beside response distributions.
- Prefer median and upper percentiles alongside mean.
- Keep creation cohorts, completion-period workloads, and backlog snapshots distinct.
- Preserve actor and assignee at event time.
- Support explicit “current assignment” views separately.
- Separate customer wait, human queue wait, AI time, translation delay, and review delay.
- Version exclusion and deduplication rules.
- Preserve historical priority, tag, queue, and policy changes if historical slicing is required.
- Never treat read, assignment, or resolution alone as a response or successful outcome.

### 9.9 Additional metrics that need separate evidence

The following are **coordinator proposals for gaps**, not researched vendor definitions or promises of historical availability:

- **First-contact resolution:** define what counts as one contact and the observation window. A proposed rate is mature eligible cases resolved within one human response episode without transfer, reopen or linked repeat contact, divided by mature eligible cases. Record episode boundaries, handoffs, outcomes and issue links; an unchanged case status alone is insufficient.
- **Repeat-contact rate:** mature resolved cases followed by another case about the same issue within a fixed window, divided by mature resolved cases. User identity and time proximity do not establish the same issue; collect an explicit relationship or reviewed classification if this report is required.
- **Self-service deflection:** documentation/widget views do not prove a prevented support request. Any future estimate needs defined exposure and outcome cohorts, privacy-conscious instrumentation and an evaluation method; the case ledger alone cannot supply it.
- **Staff occupancy and coverage:** assignment duration does not prove staffed availability or effort. These require explicitly measured availability/work sessions and a denominator such as eligible staffed time. Defer the report unless that collection is an intentional product requirement.
- **Operational reliability:** retain bounded failed-send, retry, synchronization, provider-attempt and notification-outcome evidence. Report failed or delayed publications separately from human responsiveness, including automation queue age and translation review delay.

These gaps matter because adding a schema field later cannot recover observations that never happened. They do not require collecting detailed user or staff telemetry by default.

## 10. Event ledger and illustrative schema

Zendesk stores ticket audits as update histories containing one or more events. This is evidence for retaining operational history; it does not require adopting full event sourcing. [Zendesk Ticket Audits](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/).

**Recommendation:** keep mutable operational tables plus a transactionally appended domain ledger. Services read normal projections; analytics derives timelines from the ledger. Do not make rehydration from every historical event a prerequisite for serving a case.

Illustrative proposed event:

```json
{
  "eventId": "opaque-id",
  "schemaVersion": 1,
  "caseId": "case-id",
  "caseSequence": "42",
  "cycleId": "cycle-id",
  "type": "support.message.published",
  "occurredAt": "2026-11-27T10:15:30.123Z",
  "recordedAt": "2026-11-27T10:15:30.123Z",
  "actor": {
    "kind": "human_admin",
    "userId": "admin-user-id",
    "memberId": null
  },
  "context": {
    "organizationId": "context-only-org-id",
    "channel": "in_app",
    "clientKind": "web",
    "requestId": "request-id",
    "correlationId": "operation-id",
    "causationId": "trigger-event-id"
  },
  "data": {
    "messageId": "message-id",
    "messageRevision": 1,
    "messageSequence": "18",
    "visibility": "public",
    "authorship": "human",
    "assistance": "none",
    "publishedRenditionId": "rendition-id",
    "sourceLanguage": "pl",
    "deliveryLanguage": "de",
    "translationArtifactId": "translation-id",
    "assigneeUserId": "admin-user-id",
    "queueId": "default-support",
    "responseEpisodeId": "response-episode-id",
    "handlingMode": "human",
    "policyVersionId": "policy-version-id",
    "scheduleVersionId": "schedule-version-id"
  }
}
```

The ledger should contain references and small transition facts, not transcript bodies, raw prompts, arbitrary profiles, credentials, or attachment URLs.

Proposed minimum event vocabulary:

- Case created; entered queue.
- Message accepted; published; revised; redacted.
- Assignment changed.
- Waiting responsibility changed.
- Snoozed; woke, with reason.
- Resolved; reopened; disposition changed.
- Human requested; routed; accepted; takeover completed.
- AI started; answered; abstained; failed; cancelled; superseded.
- Language decision made/overridden.
- Translation requested; completed; failed; approved; corrected.
- SLA activated; paused; resumed; fulfilled; breached; cancelled.
- Survey issued; displayed; answered.
- Privacy close/purge/redaction applied.

Use separate bounded attempt logs for provider and notification delivery details. Domain events describe what happened to the case; attempt logs explain how infrastructure tried to perform it. Read heartbeats and typing need not enter this ledger: persist required read cursors separately and keep ephemeral/high-volume telemetry bounded.

## 11. Agreement, disagreement, and coordinator judgment

All three agree on an omittable Core SupportModule; Support Case vocabulary; a PostgreSQL-owned transcript separate from Mastra; personal User privacy with platform-admin access; HTTP plus existing SSE; idempotency and case-local order; historical domain events beside current state; and independent AI/translation capabilities. They also agree to separate human replies from AI/automation, preserve originals, and avoid treating read/resolve as success. These are council conclusions, with supporting evidence in sections 2–10.

The following are **real differences in the returned proposals**, not resolved facts. The recommendation column states the coordinator's judgment.

| Topic | Different proposals | Recommended treatment and remaining uncertainty |
|---|---|---|
| Lifecycle shape | Sol separates lifecycle, waiting, snooze and AI mode. Opus/Grok combine open/pending or waiting/snoozed/resolved statuses. | Prefer separate domain dimensions; derive simple UI filters. No adopted schema decision yet. |
| Snooze and customer waiting | Sol/Grok generally keep customer waiting while snoozed. Opus excludes snoozed time in its requester-wait definition and offers pause variants. | Keep the unpaused experience clock; permit explicitly named policy variants. Snooze must not invisibly improve performance. |
| Full resolution | Sol's lifetime elapsed includes resolved gaps, with active unresolved duration separate. Opus's formula excludes resolved gaps. Grok uses last-resolution elapsed. | Publish both with unambiguous names. Do not assume vendor labels settle this. |
| First human response after outbound initiation | Sol/Grok begin on the first customer reply. Opus initially excludes admin-origin cases, then proposes a customer-response clock. | Count outbound initiation separately; start human-answer demand only when the customer replies. Retain origin so either cohort can be reported. |
| Publication/delivery | Sol distinguishes accepted from published. Opus initially calls committed messages delivered; Grok distinguishes committed from client-observed. | Persist accepted and published separately, especially for translation. Receipt/read require client evidence. |
| Public API timing and breadth | Sol requires parity from the initial release. Opus stages REST later and suggests a minimal admin subset. Grok annotates selected procedures when needed. | User explicitly requested a complete API: external contract coverage for all shipped customer/admin features is a release criterion. A native UI can come later. |
| Native authentication | Opus prefers Expo and overstates absence of bearer/Expo wiring as native being impossible. Grok suggests a user-bound token. Sol leaves the supported flow open. | Choose and test an existing Better Auth User flow; existing API-key sessions do not prove suitable mobile credentials, and missing plugins do not prove impossibility. No custom second identity system by default. |
| Customer language precedence | Sol prioritizes explicit support-language choice. Opus prefers high-confidence detection over declared locale. Grok prefers declared app locale. | Separate explicit support choice from UI locale; honor explicit choice, then recorded detection/fallback policy. Detection remains overridable. |
| Corpus fallback | Sol favors same-language generation from authorized sources. Opus sometimes generates in fallback language and translates. Grok favors customer-language generation with separate admin renditions. | Both pipelines are possible; record retrieval/generation/delivery language and avoid duplicate translation. Evaluate before selecting a default. |
| Reopen policy | Sol/Opus initially reopen the same case; Grok suggests a time window followed by a new case. | Track cycles from the start. Pick any window as product policy rather than inventing a researched universal duration. |
| Business schedule binding | Sol freezes interpretation for metric instances; Grok binds response reporting at interval completion and SLA at activation; Opus emphasizes immutable versions. | Version schedules and record effective history. Prefer activation/episode snapshots for predictable targets; document retrospective reporting policy explicitly. |
| Outbox storage | Sol/Grok use durable work intent separately from SSE hints. Opus allows the event ledger itself to act as outbox. | Preserve immutable domain facts and independently mutable delivery/attempt state, even if work references ledger rows. SSE remains best effort. |
| Saved replies and surveys | Sol favors a small early capability; Opus/Grok defer more UI. | Scope choices, not architectural blockers. Record usage/answers only when the behavior exists. |

The council also returned inconsistent detail about vendor edge cases and current library behavior. This synthesis avoids relying on weak search-summary claims where stronger sources from another member exist. It does not declare a winning vendor definition, a native library, or an AI confidence threshold.

## 12. Gaps and limits

### Gaps the three briefs did not fully resolve

These are **open design/verification questions**, not new externally researched claims.

- **Live authorization changes:** what happens to a connected admin when their role/support grant is revoked, or to a customer on Close? Current SSE attachment is User-bound after middleware authentication; the implementation must establish a revocation strategy and avoid stale sensitive snapshots. [Current subscribe route](../packages/backend/src/app.ts), [Bus attachment](../packages/backend/src/base/server-event.ts).
- **Support recipient registry:** how will eligible staff be selected and kept current across role changes, and what is the fanout/connection bound? “Emit to all admins” is a proposal, not an implemented framework capability.
- **Customer-visible cursor privacy:** internal notes create legitimate hidden positions. A native client must not interpret every sequence gap as a missing public message. Prefer opaque change cursors and explicit next-page semantics, with authorization-filtered output.
- **Old-message changes:** a messages-after-sequence endpoint alone misses edits/redactions to earlier messages. Define a separate case change order covering those events, or an explicit authoritative resynchronization strategy.
- **Initial fetch/reconnect races:** obtain a consistent snapshot boundary and catch up after it. The existing client triggers reconnect handling on an established stream's error; verify a successful-reconnect sync so changes during the outage are recovered. [Current client](../packages/frontend/src/modules/app/server-event.ts).
- **Merge/split/link history:** duplicate-case linking, future merges and multi-channel identity changes need reporting/retention semantics. Defer merge UI rather than silently rewriting old cohorts.
- **What “complete API” proves:** produce an operation-by-operation parity matrix, generated-document/client check, auth matrix, pagination/retry fixtures and compatibility policy. No member generated or exercised that artifact.
- **Original-language and privacy choices:** customer access to original admin text, sensitive logs, provider retention, geographic processing and organizational retention requirements need application-specific decisions. This council did not establish a legal regime or provider contract.

### Evidence and verification limits

Pinned-version behavior of trpc-to-openapi 2.3.0 with tRPC 11.4.3 and the repository's Zod/output schemas was not executed. The dependency is present but does not constitute an exposed OpenAPI service. No load test established SSE capacity, latency, fanout cost, or an advantage for WebSockets. [Dependency catalog](../pnpm-workspace.yaml), [Adapter documentation](https://github.com/mcampa/trpc-to-openapi).

No AI model, translation engine, multilingual quality threshold, active-work instrument, source ingestion pipeline, File sharing path or native-device implementation was validated. Corpus ownership, personal notification delivery and cleanup need concrete repository design. Vendor documentation does not supply those missing framework behaviors.

The research was read-only apart from this coordinator-authored document and temporary council working files. No application database, migrations, deployed workers, application telemetry, model-generation API or translation API was exercised. Three delegated research runs and public web requests occurred; their token/search consumption and provider quota headroom were not exposed by delegation metadata. No usage totals or enforced protection claims are inferred.

## 13. Proposed delivery sequence

### A. Human support and the complete contract

Define provisional Support vocabulary and ownership, implement explicit module composition, then deliver the widget and Support desk with authenticated personal cases, admin initiation, public replies/notes, manual assignment, priority/Tags, waiting/snooze, resolve/reopen, read cursors and safe content rendering.

Include idempotency, optimistic state updates, message/change ordering, durable synchronization, metric events, redaction/retention integration and cross-User SSE hints in this phase. Secure File access is a prerequisite for attachments; if unresolved, explicitly keep attachments out of the initial release rather than using broad Organization access.

Publish the versioned HTTP/OpenAPI contract alongside tRPC for every shipped operation. A complete contract includes configuration/capabilities, case/history/change reads, user/admin creation, messaging/notes, read state, lifecycle/assignment, attachment access, and errors/retries. Later enabled AI/translation features receive matching operations when they ship.

Compose /admin/support as a sibling module route through existing admin links. Implementation should include appropriate cross-actor, concurrency and synchronization checks plus localized Starter product documentation. These requirements follow current admin composition and repository rules. [ADR-0021](adr/0021-admin-panel-sidecar-module-admin.md), [AGENTS.md](../AGENTS.md).

### B. Optional translation and documentation answers

These can ship independently. Translation is the smaller proposed first slice: app-locale settings, originals/renditions, language control, failure hold/retry, usage and corrections. AI then adds the approved corpus, cited answers, human request/takeover, race checks, bounded usage and evaluation. Product priority may reverse their order.

A capability being disabled, unavailable, out of budget or omitted must be explicit in discovery/settings; it must not strand a customer without the human-support path. Provider/corpus configuration must be validated before enabling automated publication.

### C. Operational reporting and native UI

Build reports from the established metric dictionary and raw history: unanswered demand, first/next human response, handoff delay, resolution cycles, waiting breakdown, backlog age, assignments/transfers/reopens, CSAT, AI outcomes and translation cost/quality.

Introduce SLA policies with immutable target/calendar snapshots and events **when enforcement begins**. Historical events can support later retrospective analysis, but cannot prove that a never-configured SLA was historically active. True active handle time and CSAT cannot be reconstructed from absent instrumentation or surveys.

Build a React Native widget against the same API, using the chosen User-auth flow, foreground synchronization and an explicit background-notification decision. This is a later client, not a new transcript or mandatory WebSocket layer.

### D. Additional channels

Retain a small transport seam now: source channel, reply relationships and optional external identities/references. Add email only after deciding identity verification, recipients, deduplication, MIME/attachment handling, threading and delivery/retention. RFC 5322 message identity and reply fields are relevant to that future work. Do not implement mailboxes, email-user matching or an unverified requester-identity registry now. [RFC 5322 §3.6.4](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4).

## 14. Product decisions before implementation

These are future alignment points; they do not block this research deliverable.

1. Are all platform admins support staff, or should custom User roles/grants narrow access?
2. Keep cases private to the requester, or add an explicitly shared Organization mode? Recommended initial default: private.
3. Can customers resolve cases, and do late replies reopen indefinitely or create linked cases after a window?
4. What constitutes spam, duplicate, abandonment and successful resolution? Which cohorts exclude them?
5. Which app locales are handled natively, what is the default admin translation target, and how may per-admin preferences differ?
6. Should successful outbound translations send automatically or require preview for selected cases? What original text is customer-visible?
7. Which documentation source/release/Experience and visibility rules govern AI? What questions must always reach a person?
8. What are the human-request/out-of-hours experience, automation budgets and kill-switch ownership?
9. What are the initial message edit/redaction, File scanning/access and retention policies, including Close and Purge?
10. Which human-response, business-calendar, SLA pause/reopen and mature-observation definitions will the product adopt?
11. Is minimal CSAT/active-work collection required at launch, accepting that missing historical evidence is unrecoverable?
12. Which revocable native User-auth mechanism and personal notification path will be officially supported?

## 15. Merged sources

The catalogue below deduplicates the sources actually used in this synthesis across the three briefs. It is selected from their combined research; weak or unused secondary/legal sources are omitted. Repository links identify the inspected local artifact. Protocol/library documentation can change after the research date.

### app.chatwoot.com

- [Chatwoot translation](https://app.chatwoot.com/hc/user-guide/articles/1792447465-auto_translate-conversations) — sol.
- [Chatwoot reporting calculations](https://app.chatwoot.com/hc/user-guide/articles/1795601793-how-reports-work-controls-metrics-and-who-gets-credit-eedd870e) — sol, grok.
- [Business hours](https://app.chatwoot.com/hc/user-guide/articles/1777421876-business-hours-and-auto_responder) — sol.

### better-auth.com

- [Bearer plugin](https://better-auth.com/docs/plugins/bearer) — sol.
- [Expo integration](https://www.better-auth.com/docs/integrations/expo) — opus.

### chatwoot.com

- [Chatwoot core features](https://www.chatwoot.com/hc/user-guide/articles/1677235281-lesson-3-a-mastering-core-features) — sol.

### cheatsheetseries.owasp.org

- [OWASP prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) — sol.

### developer.android.com

- [Android Doze](https://developer.android.com/training/monitoring-device-state/doze-standby) — opus.

### developer.apple.com

- [Apple background pushes](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app) — grok.

### developer.zendesk.com

- [Ticket audits](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/) — sol.
- [Ticket metric events](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_metric_events/) — opus, grok.
- [Safe updates](https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/) — sol, grok.

### developers.chatwoot.com

- [Chatwoot message and read APIs](https://developers.chatwoot.com/api-reference/messages/create-new-message) — sol, grok.
- [Chatwoot last seen](https://developers.chatwoot.com/api-reference/conversations/update-last-seen) — sol.
- [Chatwoot status API](https://developers.chatwoot.com/api-reference/conversations/toggle-status) — opus, grok.

### docs.aws.amazon.com

- [Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — sol.

### docs.stripe.com

- [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests) — opus, grok.

### github.com

- [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi) — sol, opus, grok.

### html.spec.whatwg.org

- [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) — sol, opus, grok.

### intercom.com

- [Intercom AI outcomes](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes) — sol.
- [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) — sol, opus.
- [Outbound contact](https://www.intercom.com/help/en/articles/6433002-start-a-conversation-from-the-inbox) — sol.
- [Fin sources](https://www.intercom.com/help/en/articles/7837514-add-your-content-for-fin-ai-agent) — sol, opus.
- [Audience rules](https://www.intercom.com/help/en/articles/9357948-manage-audiences-for-fin-and-copilot) — sol.
- [Multilingual setup](https://www.intercom.com/help/en/articles/8322387-set-up-fin-ai-agent-s-multilingual-support) — sol.
- [Escalation](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules) — sol, opus, grok.
- [Intercom translation](https://www.intercom.com/help/en/articles/10545610-how-to-use-ai-inbox-translations) — sol, opus, grok.
- [Translation behavior](https://www.intercom.com/help/en/articles/16296591-understanding-translation-behavior-in-intercom) — grok.
- [Intercom reporting metrics](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes) — sol, opus, grok.
- [Intercom reporting FAQ](https://www.intercom.com/help/en/articles/8921906-reporting-faqs) — sol.

### learn.microsoft.com

- [Azure translation API](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate) — sol.

### postgresql.org

- [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html) — sol.
- [Sequences](https://www.postgresql.org/docs/current/sql-createsequence.html) — opus.

### reactnative.dev

- [React Native networking](https://reactnative.dev/docs/network) — sol, opus, grok.
- [AppState](https://reactnative.dev/docs/appstate) — sol, grok.

### redis.io

- [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics) — sol.

### rfc-editor.org

- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) — sol, opus.
- [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585) — sol, opus.
- [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4) — sol.
- [RFC 5646](https://www.rfc-editor.org/rfc/rfc5646) — sol, opus.

### support.zendesk.com

- [Zendesk lifecycle](https://support.zendesk.com/hc/en-us/articles/8263915942938-About-the-ticket-lifecycle-and-ticket-statuses) — sol, opus.
- [Zendesk status guidance](https://support.zendesk.com/hc/en-us/articles/4408843029658-About-open-vs-pending-and-on-hold-tickets) — sol.
- [Zendesk metric definitions](https://support.zendesk.com/hc/en-us/articles/4408827693594-Metrics-and-attributes-for-Zendesk-Support) — sol.
- [Zendesk SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies) — sol, opus, grok.
- [Zendesk efficiency metrics](https://support.zendesk.com/hc/en-us/articles/4408832234394-Analyzing-the-metrics-that-matter-to-improve-customer-support) — sol.

### trpc.io

- [tRPC subscriptions](https://trpc.io/docs/server/subscriptions) — sol, opus, grok.
- [tRPC native compatibility](https://trpc.io/docs/client/links/httpSubscriptionLink#compatibility-react-native) — sol.

### w3.org

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — sol, grok.
- [ARIA log](https://www.w3.org/TR/wai-aria-1.2/#log) — opus.
- [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — opus.
