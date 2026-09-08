# Architecture review — 6 September 2026

Reviewed checkout: `cbf9647`. Scope: Kernel composition and infrastructure, representative Core and Optional Backend Modules, Starter composition, and shared frontend session/query/event plumbing. This is an architectural assessment of the current checkout, not a diff review or an exhaustive audit of every module. No production code was changed.

**Assessment:** the stack has a useful architecture worth retaining. Its biggest weakness is the gap between the Interface it advertises and the guarantees its Implementation enforces. Explicit dependencies become `any`; lifecycle hooks lose their module context; permission checks change meaning with the shape of a result; some declared domain decisions are not reflected in the shipped surface. Strengthening those guarantees offers more Leverage than adding another abstraction layer.

**Preserve:** class-based extensibility, explicit app composition, Repository/Service/transport separation, shared contracts, Result-based errors, dependency ordering with cycle detection, Core versus Optional package separation, and the separate Database command entry point. Kernel ownership of the HTTP shell and Server events is justified by ADR-0003 and ADR-0010. A smaller Implementation can retain that ownership.

## Prioritized findings

### 1. Make lifecycle a reliable resource owner — high priority

Evidence: [app.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/app.ts:924).

Startup and shutdown hooks receive one shared `lifecycleContext` whose `deps`, `repositories`, and `services` are all empty. Earlier hooks receive module-specific values. A module that correctly uses `ctx.services` during startup therefore fails at runtime despite its declared types. The global `modules` map works as a workaround, but defeats the local dependency Interface.

Shutdown also stops at the first rejected hook. Subsequent module hooks, Workflow cleanup, Redis/DB disposal, and `onShutdown` are skipped. Since `shuttingDown` remains true, retrying `shutdown()` immediately returns. Concurrent callers likewise do not await the same completion. Signal-driven shutdown exits with code zero in `finally`, even after a cleanup failure.

Construction opens resources before all hooks and registrations have succeeded, without rollback. Startup begins workers before module startup hooks complete; a failed startup hook has no automatic unwind. Repeated headless starts rerun startup hooks, and there is no terminal-state check preventing startup after shutdown.

**Improve:** create module-local lifecycle contexts; track explicit lifecycle states and shared start/stop promises; register cleanup when resources are acquired; unwind partially acquired resources on failure. Attempt each cleanup step in dependency-safe order and aggregate errors afterward. Separate stopping incoming work from disposing the resources active work needs. Keep Kernel signal ownership, while making its failure policy explicit and adding a bounded drain period.

**Verification:** probes confirmed empty contexts, skipped cleanup after a throwing hook, ineffective shutdown retry, and repeated headless startup hooks. Add permanent behavioral coverage for failed construction/startup, concurrent shutdown, and drain ordering when implementing the fix.

### 2. Stop treating every transport failure as permission to replay writes — high priority

Evidence: [libsql.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/lib/libsql.ts:79), [app.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/app.ts:422).

The automatically installed libSQL wrapper retries `execute`, `batch`, `migrate`, and `executeMultiple` on broad transport codes. These operations can contain non-idempotent writes. A response lost after a write commits is ambiguous: reconnecting and repeating the request can apply it twice. Avoiding retries inside interactive transactions is good, but does not make top-level writes safe.

**Improve:** distinguish failures known to occur before execution from ambiguous outcomes. Default to surfacing ambiguous write failures; allow retries where the caller supplies a safe operation or durable idempotency mechanism. Avoid trying to infer full write safety from SQL text alone. Preserve the existing recovery behavior for cases with a demonstrated safe replay contract.

**Verification:** a simulated client applied a write, threw `HRANA_WEBSOCKET_ERROR`, and applied the write again through the wrapper. This proves the wrapper's behavior under an ambiguous response; it does not establish that a production duplicate has occurred.

### 3. Add an HTTP contribution Interface for body parsing — high priority

Evidence: [app.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/app.ts:586), [billing.router.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/modules/billing/billing.router.ts:55), [billing.module.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/modules/billing/billing.module.ts:75).

The Kernel installs global `express.json()` before every module `express` hook. A module that subsequently mounts a raw JSON webhook parser receives an already consumed body. The exported Billing router expects `Buffer | string` for event verification, so mounting it through the standard module hook is incompatible with the default shell.

There is an adjacent completeness gap: `BillingModule` contributes repositories, services, and tRPC, but never mounts `createBillingRouter`. Registering Billing alone does not expose its exported HTTP webhook/checkout/portal routes. No call site for that factory was found in the inspected source.

**Improve:** let modules declare their routes and body requirements before the Kernel assembles middleware. A narrow pre-parser route contribution would also solve the immediate issue. Preserve raw bytes where required, then apply the ordinary JSON defaults. Wire Billing's HTTP contribution explicitly and exercise it through `createBackendApp` with a locally generated signed fixture.

This preserves ADR-0003's Kernel ownership. Apps should not need to discover and repair middleware ordering themselves.

**Verification:** a real loopback request through the Kernel to a module's raw-parser route produced an object rather than a Buffer. This was a middleware probe, not a live Stripe integration test.

### 4. Put authorization before pagination, and separate filtering from asserting — high priority

Evidence: [base.grants.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/base/base.grants.ts:343), [base.procedure.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/base/base.procedure.ts:836).

`filterListResultByPermission` subtracts only the rejected rows on the current page from the global count. With 100 inaccessible rows and a ten-row page, it returns `{ rows: [], total: 90 }`. This produces incorrect page counts and can disclose counts of inaccessible records. Post-filtering also creates short or empty pages even when accessible records exist later.

Additionally, `.access()` rejects unauthorized single entities but silently filters arrays and list results. For a bulk write, a caller can mistake “some entities were filtered” for “the requested operation is authorized,” particularly if the handler still uses the original input IDs. This is a dangerous Interface ambiguity, not a claim that an inspected bulk endpoint is currently exploitable.

**Improve:** introduce a grant-derived scope that the Repository applies to both rows and count before pagination. Keep domain-specific policies in Services and translate only supported ownership/org predicates at the query seam. Use clearly distinct operations for asserting access to every target and selecting readable entities. For policies that cannot be pushed into a query, use an honest list contract without a fabricated exact total.

The builder also allows `.handle()` without an access step, despite the glossary describing a Procedure as Grant-checked. Starter `PostsService.list` illustrates this: it filters Organization scope but does not consult read Grants. Decide whether permissioned Procedures must explicitly declare their access policy or whether the glossary should describe the weaker guarantee. Do not equate tenancy filtering with Grants.

**Verification:** a probe confirmed the `total: 90` example; the builder behaviors were traced in source.

### 5. Make dependency types match dependency declarations — foundational improvement

Evidence: [base.module.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/base/base.module.ts:27), [app.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/app.ts:170), [auth.module.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/modules/auth/auth.module.ts:106).

`ModuleTypedDeps` retains dependency names but maps their values to the untyped runtime record instead of extracting each module's repositories/services. It also intersects with an unrestricted string index. Local service/repository maps are intersected with `AnyRecord`, and the returned app module map loses its concrete value types. A declared `AuthModule` dependency therefore does not provide the corresponding precise dependency contract.

The global `ctx.modules` map makes it possible to reach undeclared dependencies, where initialization order then depends on registration details. `BaseService` also permits omitted constructor maps even when its generics declare required dependencies, using casts from `{}`.

Schema ownership is similarly misleading: module table maps are initialized to `{}` and never populated. `dbDependsOn` verifies module presence, while the table-bearing dependency Interface suggests more. The actual schema is supplied separately by the app. `AppDbSchema` additionally claims Auth tables even for an empty app.

**Improve:** infer dependency exports from the declared module types; preserve optionality; remove public catch-all indexes; keep runtime type erasure inside the orchestrator. Restrict ordinary hooks to declared dependencies, with whole-app inspection reserved for an explicit composition stage. Require dependency constructor arguments when nonempty. Retain app-owned schema composition and validate required tables, or implement real table contributions—choose one model and remove the misleading remainder.

**Acceptance criteria:** compile-time checks reject undeclared dependencies, misspelled exported services, unsafe optional dependency access, and missing required constructor arguments. Runtime checks reject missing required schema before opening external resources. A probe confirmed the empty runtime table map; the type weaknesses are source-inspected, not separately compiler-probed.

### 6. Move Core-specific discovery out of the orchestrator — medium priority

Evidence: [app.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/app.ts:366), [app.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/app.ts:761).

The Kernel imports concrete Workflow and MCP services, finds them with `instanceof`, scans every module's service properties, constructs their registries, and contains MCP-specific OAuth setup. Each new facility of this kind tends to add another special path to `createBackendApp`. That weakens composability even though those Core Modules may be omitted.

**Improve:** give modules an explicit, typed contribution/assembly phase for exported job definitions, MCP calls, and runtime capabilities. Let Workflow and MCP own their discovery and validation through that phase. These two existing consumers justify a real seam; a generic plugin container or universal event system is unnecessary. Preserve registration convenience and class-based extension.

Separate the Implementation into module-graph validation, resource ownership, HTTP assembly, and lifecycle execution while retaining `createBackendApp` as the main external Interface. Splitting files alone would not address the coupling.

### 7. Coordinate session identity with frontend cache identity — high priority to verify end to end

Evidence: [AppTrpcQueryProvider.tsx](/Users/michalkow/Projects/m5kdev/packages/frontend/src/modules/app/components/AppTrpcQueryProvider.tsx:19), [AuthProvider.tsx](/Users/michalkow/Projects/m5kdev/packages/frontend/src/modules/auth/components/AuthProvider.tsx:57), [usePostsList.ts](/Users/michalkow/Projects/m5kdev/apps/starter/webapp/src/modules/posts/hooks/usePostsList.ts:27).

The default browser QueryClient is shared, while sign-out only clears session state. Organization-sensitive post queries use filter input as their cache identity while the server selects Organization from session. The inspected Starter composition supplies no central session-to-query-cache coordination. Changing User or Organization can therefore reuse an identical key for data that belongs to the previous identity.

**Improve:** centrally handle identity transitions in provider composition: cancel old scoped requests, retire the previous identity's cache, and scope Organization-dependent keys or cache instances appropriately. Keep ordinary mutations narrowly invalidated. Identity transitions deserve a different policy from routine mutations.

This is a source-supported risk; an end-to-end account/Organization switch was not executed. Verify both stale cached results and late responses from the previous identity.

## Additional improvements before freezing the surface

| Area | Observed weakness | Recommended direction |
| --- | --- | --- |
| Server event recovery | Client `onReconnect` runs in `onerror`, not after a successful reopen. Invalidation can finish before missed changes occur. See [server-event.ts](/Users/michalkow/Projects/m5kdev/packages/frontend/src/modules/app/server-event.ts:54). | Invalidate affected queries after a confirmed reopen. This implements ADR-0010's recovery promise without adding replay. Test disconnect → missed change → reconnect. |
| Server event resource policy | The Redis subscription starts during construction without awaiting readiness; writes ignore backpressure; the channel prefix has no app/environment scope. See [server-event.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/base/server-event.ts:37). | Own subscriber readiness/disposal in lifecycle, bound slow-client buffering, and allow namespace isolation for apps sharing Redis. Retain best-effort delivery. |
| Observability configuration | Kernel accepts a logger, but Base and WorkflowRegistry create children of a global logger. Procedure spans serialize complete input, with truncation but no redaction. See [base.abstract.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/base/base.abstract.ts:14), [telemetry.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/utils/telemetry.ts:148). | Propagate the configured logger through construction. Make captured input fields explicit or redact them centrally; do not treat truncation as redaction. Keep early telemetry initialization app-owned per ADR-0003. |
| Actor freeze | Public `TeamActor`, team Grant levels, and team branches remain even though session-based team actor construction always rejects. See [base.actor.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/base/base.actor.ts:25). | Complete ADR-0011's removal before 1.0. Also fix `hasServiceActorScope(actor, "admin")`, whose fallback currently tests only user validity. No production call-site exploit was established. |
| Billing domain | Subscription reads use `ctx.actor.userId`, checkout uses a User's customer, while CONTEXT defines the billed party as Organization. See [billing.service.ts](/Users/michalkow/Projects/m5kdev/packages/backend/src/modules/billing/billing.service.ts:96). | Complete the accepted Organization billing model before freezing the contract, including customer ownership, access checks, and upgrade behavior. Any schema migration generation remains user-run under AGENTS.md. |
| Documentation and surface | Root instructions specify `repository.ts`/`service.ts` roots and `Providers.tsx`, but Starter composes repositories/services in module hooks and providers in `App.tsx`. Wildcard exports expose implementation files as potential public imports. | Choose and document the intended composition convention, remove obsolete compatibility scaffolding before freeze, and publish a deliberate supported surface. Preserve promised compatibility paths until an announced removal. |

## Suggested implementation sequence

1. **Correctness fixes:** module-local lifecycle context, cleanup that continues after failures, safe retry policy, raw-body support/Billing route integration, and honest permission-aware pagination. Each should have a focused regression test through the real Interface.
2. **Composition guarantees:** typed dependency exports, schema requirements, required constructor dependencies, lifecycle state and rollback. These are the foundation for reliable extension.
3. **Cross-cutting consistency:** identity-aware query cache handling, confirmed-reconnect invalidation, configured logger propagation, and input redaction.
4. **Kernel simplification:** contribution assembly owned by Workflow/MCP, smaller internal orchestrator modules, and explicit public exports. Complete the accepted Team and Billing domain migrations before freezing.

Avoid a general DI container, a new transport system, a database-agnostic Repository layer, or splitting every Core Module into a separate package as the first move. None is required to resolve the demonstrated failures. Keeping vendors visible is intentional in ADR-0001; catalog lockstep is intentional in ADR-0004. Reopening either would require a separate compatibility case.

ADR-0015 explicitly permits MCP handles to call unguarded code. This review does not classify that choice as an accidental implementation bug. Mandatory MCP Grants would contradict that ADR and need an explicit decision. An optional adapter to an existing guarded Service entry could reduce duplication without changing the default contract. Likewise, mandatory event replay or Kernel-side snapshot Grants would reopen ADR-0010; neither is recommended here.

## Validation and limits

- Five existing suites passed: `app.test.ts`, `app.listen.test.ts`, `app.http.test.ts`, `base.grants.test.ts`, and `base.service.test.ts`: **138 tests**. The first HTTP run encountered sandbox socket restrictions; rerunning with local socket access passed.
- Seven temporary behavioral probes passed, confirming the problematic current behavior described above. They were removed from production source after the review; their passing status means the reproductions succeeded, not that the defects were fixed.
- Local evidence: [existing test log](/tmp/m5kdev-architecture-tests.log), [probe log](/tmp/m5kdev-architecture-probes.log), [probe source](/tmp/m5kdev-architecture-review.probe.test.ts). These temporary files are not durable repository artifacts.
- No full monorepo build, full test suite, production load test, live Redis/Stripe/Turso verification, or frontend account-switch test was performed. Resource scale, ambiguous write outcomes, and frontend identity risks should be tested under their stated conditions.
