# Domain-selected Experiences

Experiences are presentation configuration, independent of Organization tenancy, Billing Entitlements and Grants. Apps own their routes and workflows; the Kernel owns host resolution. See ADR-0038 and specification #88.

## Configure public identity

Existing `app.name`, `app.urls`, `app.brand` and their environment defaults remain a supported single-Experience shorthand. To opt into explicit resolution, supply `app.experiences` instead of those competing fields:

```ts
experiences: {
  defaultExperience: "radar",
  brands: { radar: { name: "Radar" }, partner: { name: "Partner Radar" } },
  definitions: {
    radar: { product: "radar", brand: "radar", webOrigin: "https://radar.example", apiOrigin: "https://radar.example" },
    partner: { product: "radar", brand: "partner", webOrigin: "https://partner.example", apiOrigin: "https://partner.example" },
  },
}
```

Kernel `app.urls.web`/`api` and registry origins are HTTP(S) **origins**: no path,
query, fragment or credentials. A trailing root slash is normalized. API prefixes
are not a supported Kernel deployment contract. Better Auth's explicit
`options.basePath` and standalone Auth's static `app.urls.api` base-URL path
behavior remain SDK-owned; register the corresponding exact provider callbacks and MCP URLs.
Kernel and standalone Auth share presentation normalization. Explicit metadata
wins over environment defaults; raw `experiences` cannot be mixed with singular
name/URL/brand or a resolved registry, even when values are empty. Existing code
annotated with exported `BackendAppMetadata` remains supported.

The default identifies deliberately context-free operations. It never rescues an unknown browser host. Duplicate web authorities, unknown profiles, invalid origins and ambiguous API ownership fail at boot. Deployed configurations require HTTPS. A strict Auth composition requires one
protocol across its active API origins; mixed HTTP/HTTPS API definitions fail at
Auth boot rather than inheriting the default Experience's callback scheme.

## Bootstrap before authentication

`GET /app/experience` returns only the selected public descriptor with private/no-store caching. Call `loadExperience` from frontend app integration before rendering providers, or supply a matching validated descriptor to a separately hosted frontend. Pass `{ experience, locales, roles }` to `AppConfigProvider`; existing hooks expose the selected name and canonical URLs before auth loading.

Keep shells/routes in app composition. Multiple Experiences can share a product key and have different brands. Theme and copy references select app-owned resources; they are not arbitrary theme code. The Kernel still serves one optional baked SPA root; separate frontend builds can be hosted externally.

## Deploy domains and proxies

Prefer a same-origin API/auth proxy on each product domain. When several Experiences share a distinct API authority, only an exact registered browser Origin/API pair selects one. Ordinary no-Origin API calls may remain presentation-neutral; a branded operation must receive explicit validated context.

List aliases as canonical origins. `infrastructureHosts` may admit unbranded health probes. Set `trustedProxyHeaders` only behind an ingress that overwrites client-supplied forwarded headers. Unknown/conflicting hosts and origins fail without generating cookies or redirects. Aliases are public entry addresses, not cookie-sharing authorities. Navigate at
the app/ingress boundary to the selected canonical API/web entry **before** sign-in
and cookie-sensitive OAuth or Connection starts. A host-only cookie established
on an alias/web-only authority cannot be transferred to another callback host.
Omitted OAuth callbackURL defaults to that selected web origin's `/`, including
split API deployments. Configured Better Auth base paths are preserved.

Partition external caches by host/Experience and locale; private auth and capability responses are not shared content.

## Authentication and communications

### Domain-local authentication

The Better Auth wrapper derives allowed hosts, trusted origins and base URLs from the registry. Explicit multi-experience configurations use host-only cookies; a shared User can sign in independently on each unrelated product domain. They do not share browser sessions automatically.

Sign-in return destinations must belong to the entered Experience, even when another product origin is also trusted. Relative destinations are resolved against that Experience's canonical web origin. OAuth initiation carries a trusted server-side Experience reference in provider state; arbitrary client additional data cannot replace it. The same validation runs for HTTP handlers and direct auth API calls.

MCP tools continue to use OrganizationActor and the existing allowlist. The default Experience supplies the canonical login/consent presentation; product branding does not create another issuer or grant a capability.

MCP discovery and token verification retain the default Experience's canonical
issuer, resource and JWKS address even when browser authentication accepts several
domains. The protected endpoint checks signature, issuer, audience and expiry and
keeps shared DPoP replay protection; it does not require a global browser auth URL.

Starter retains the single-Experience shorthand. Its recovery screen preserves complete reset links and explains how to request a fresh link; both configured guide locales describe that journey.

### App-authored immediate email

Email profiles in `app.experiences.emailProfiles` select a sender and optionally a
named template set. Register sets with `new EmailModule(templates, { templateSets })`;
each named set is complete and does not inherit missing templates. Referenced sets
are checked at boot.

Pass `{ experience, linkPaths: { url: "/reports/7" }, locale: recipient.locale }`
to `sendTemplate` or `sendBrandTemplate`. The Experience can be a configured id or a
resolved request descriptor; the registry validates the reference and supplies the
approved public descriptor and Brand Profile. Named link props resolve through the
same canonical-destination validator used for returns. Invalid/cross-Experience
links fail before delivery. Template props cannot replace the selected identity or
resolved link props. App-authored arbitrary content strings are not rewritten.

Per-send sender overrides win over the selected template's sender, then the email
profile, then the existing global sender. Per-send subject/preview literals win over
template text, and recipient locale wins over existing i18n/app defaults. EmailService
never writes locale/preferences. Send/store/log behavior remains exclusive; stored
readers expose sender, template id, public identity/link props and actual HTML without
injecting the private email profile or credentials.

Explicit registries require context even with one definition; their default is not
an email policy. Existing single-Experience shorthand keeps context-free sends and
its existing brand customization. Unknown/disabled references fail, and overlapping
sends never mutate the service's current brand. Background and trial communications use the explicit app policy below. Auth invitation, waitlist and account-claim
continuation support is described below. See
`apps/docs/docs/modules/email/index.md` for complete immediate-send examples.

### Background and server-initiated communications

Register `communicationPolicy` on `new EmailModule(templates, { templateSets,
communicationPolicy })`. Its `CommunicationContext` and
`CommunicationExperienceInput` types derive from the server-only schemas in
`@m5kdev/backend/modules/email/email.schema`. Context contains `event` and optional
`eventId`, `userId`, `organizationId`, `resourceId`; it is built by the owning server
operation from trusted ids, not recipient email, a previous visit, Actor, or saved
Entitlements. Policy returns one commons `ExperienceId` (or a Promise); parse app
configuration/lookup strings with `experienceIdSchema`, never a type assertion.

Call `email.resolveCommunicationExperience({ experienceId?, context? })` explicitly
before a branded side effect. A bound, validated id wins and is resolved against the
current registry; removed, disabled or malformed ids fail without invoking policy.
With no bound id, registered policy runs once and must return one valid current id.
Missing context, undefined/null/ambiguous/invalid output and lookup failures return
an explicit Result error, including with shorthand. Without an id or registered
policy, only normalized supported shorthand can use its default; even a one-entry
explicit registry remains strict.

Keep the returned `PublicExperience` for the whole operation: for example, Billing
resolves once after authoritative billing/event checks, then creates its contextual
Portal and sends with that same descriptor. Policy is not called implicitly by
sendTemplate/sendBrandTemplate; pass `{ experience, linkPaths, locale }` through the
existing path. This avoids running a lookup again between a related link and its
message. Sender/template overrides and recipient/Organization locale remain as
documented above. It does not change which Organization owns the resource, current
Grants/Entitlements or delivery deduplication. The resolver requires an app
registry; existing manually constructed EmailService send APIs are unchanged.

Queue only the approved `experience.id` plus existing minimal User/Organization/
resource ids. Use the existing commons id schema for a raw queue/config boundary,
and parse raw input at enqueue as well as execution. Workflow `.input(schema,true)`
validates `payload.data`; derive its shape/type once and use a `{ data: ... }`
payload for that option. The owning worker service reloads actual resource scope,
Membership, current access/expiry and locale before sending. Selecting a brand never
licenses a delayed operation. Neutral Workflow jobs acquire no Experience gate.

Every execution uses the current immutable deployment registry, not a serialized
public descriptor, sender or origin. Retain referenced ids until queued work is
drained or explicitly migrated; removal/disablement deliberately causes failure.
Older jobs with no reference keep the supported shorthand default. Adopting strict
configuration requires an explicit app communication policy using those jobs'
trusted resource/event ids or the operation fails; there is no blanket legacy-job,
first-entry or last-browser fallback. Generic jobs do not borrow the separate
signed-link legacy time policy. See the complete examples in
`apps/docs/docs/modules/email/index.md` and `apps/docs/docs/modules/workflow/index.md`.
Trial webhook production uses event `billing.trial-will-end`, its verified event id,
authoritative Organization id and Subscription id as resourceId. Billing resolves
once before Portal creation and passes the same descriptor to send. Email-owned
`hasTemplate` has schema-discriminated `any` reachable and selected `experience` modes:
no reachable optional warning template retains its no-op without policy; selected
absence skips without base fallback; a reachable message with invalid policy fails
before Portal/send. Disabled/unreferenced sets never enable the feature.

### External Connections

`ConnectModule` normalizes provider callbacks from the configured canonical API
origin and mount path. Register every product callback with the external provider;
keep explicit per-Experience callback overrides in trusted server configuration.
Provider factories retain credential configuration but no longer read singular
runtime URL environment variables.

Start a Connection on its canonical authenticated API authority. Strict mode rejects
an alias/web-only start because its host-only session would not reach the canonical
callback; use the canonical entry or same-origin proxy. A shared API start requires
a configured Origin pair or trusted explicit server context. A top-level cross-site
GET cannot be assumed to supply Origin or a usable API cookie. There is no SSO
handoff or inferred User/Organization.

For a browser using a shared API, POST JSON to the configured mount's
`/:provider/start` with credentials. The route returns `{ url }` and
`Cache-Control: private, no-store`; navigate only after the successful response.
It accepts only optional `redirect`, a local return destination. The provider is
selected by the route. Caller state, callback URLs and arbitrary OAuth parameters
are rejected. Existing GET starts retain their redirect behavior.

```ts
const response = await fetch(
  `${experience.apiOrigin}/connections/google/start`,
  {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect: "/settings/connections" }),
  },
);
if (!response.ok)
  throw new Error("Unable to start connection. Try again here.");
const { url } = await response.json();
window.location.assign(url);
```

Use the module's configured mount and provider id; the example assumes
`mountPath: "/connections"`. Cookie policy must allow that browser/API topology.
No shared Connections screen is installed in the normal Starter.

The opaque provider nonce refers to private per-app state binding User/session,
provider, Experience, canonical local destination, exact callback URI, PKCE and
checked expiry. Both success and provider-error callbacks consume it once and use
its stored return. Changing callback queries, request Origin or destination cannot
relabel it. Invalid/expired/replayed state fails without a foreign redirect. Local
returns reject protocol-relative forms even after URL leading-control normalization;
legitimate encoded query spaces remain supported.

Current Connection state stays in memory: start/callback need the same instance,
and restart requires authorization to be started again. No new tables, distributed
state guarantee or presentation authority on Connection rows is added. User-owned
list/delete/reconnect and neutral refresh/Social/MCP behavior remain intact. See
`apps/docs/docs/modules/connect/index.md` for callback registration, custom mount
paths and direct service consumer migration.

### Verification and password recovery

Configure a stable server-only `experienceFlowSecret` (at least 32 characters) on
`createBackendApp`. The Kernel normalizes it once, with `BETTER_AUTH_SECRET` as an
optional fallback when it has at least 32 characters, including shorthand. It constructs one immutable
`ExperienceFlowSigner`, exposes it to module services as `infra.experienceFlows`, and
passes it to the auth factory as `experienceFlows`. Forward that value to
`createBetterAuth({ ..., experienceFlows })`. Direct compositions may inject a signer
created with their registry and explicit stable key. Never put a signing key in an
Experience Definition, public bootstrap descriptor, frontend config or job payload.
Use the same key on all instances; rotating it invalidates outstanding continuations.
If a custom auth factory uses another auth secret/keyring, configure the flow key
explicitly rather than assuming the environment contains that factory's key.

The signer binds purpose, the auth token/resource digest, Experience, canonical
destination and expiry. It does not grant Membership or replace the underlying
token's authority or one-use rules. Owning services can reuse the injected
`sign`/`verify` operations with distinct purposes; each flow still checks its owning
resource and request authority.

Built-in verification/reset senders select the requesting Experience's sender,
template and links together, retaining recipient locale. Links contain a signed
continuation inside their callback destination. Keep the complete generated URL.
Reset pages preserve the `experienceFlow` query value and submit it using the
`X-M5kdev-Experience-Flow` header with the original reset token. The shared reset form
does this automatically. Custom frontends must do the same; use the exported commons
constants. The Kernel includes the header in default credentialed CORS configuration.

HTTP requests and direct auth API calls enforce identical bindings. A valid signed
continuation can select its registered Experience on a shared API without Origin;
it cannot select an Experience outside that API's configured host/origin pairs.
Changed destinations, another token's continuation, expired proofs and removed or
disabled Experiences fail without navigating to another brand. Password reset still
consumes Better Auth's original token once. No new tables or token store is added.

Existing single-Experience shorthand continues to accept raw outstanding links.
When adopting strict registry configuration, an optional, default-off policy can
preserve tokens issued by the one known former Experience:

```ts
createBackendApp(
  {
    // Other app configuration and a stable experienceFlowSecret...
    experienceFlowLegacyPolicy: {
      experience: "radar",
      issuedBefore: new Date("2026-11-16T12:00:00Z"),
      acceptUntil: new Date("2026-11-17T12:00:00Z"),
    },
  },
  modules,
);
```

Choose the real deployment cutoff and a short acceptance deadline, and use the same
policy on every instance. The issuance cutoff must already be in the past; it is
rounded down to whole seconds because verification JWTs use second precision.
Tokens issued during that cutoff second must use their signed continuation or be
reissued. A direct composition passes `{ legacyPolicy }` as the third
`ExperienceFlowSigner` constructor argument. This server-only policy never selects a
brand from a caller's query and cannot admit an unsigned post-cutover token.

Reset eligibility uses the existing verification record's creation time, including
on direct reset POST calls. Verification eligibility reads JWT issuance time only
as a gate; Better Auth still verifies its signature and expiry before changing a
User. Both paths enforce the fixed legacy Experience's configured API/Origin pair
and canonical destination. Invalid supplied proofs are never downgraded into legacy
admission. New links always contain a proof, and the deadline closes old-link
admission automatically. Missing historical issuance data fails closed; request a
fresh link instead. No new metadata table is required.

The same injected signer exposes `verifyLegacy({ issuedAt, experience?, destination? })`
for owning adapters. It checks only policy eligibility and returns the fixed
Experience and canonical destination. An adapter must obtain authoritative issuance
data from its existing resource and still authenticate, expire and consume that
resource before any effect. Do not pass caller-supplied timestamps as authority.

One Trial Plan per currency, one Subscription per Organization/environment and account-wide Stripe identity constraints remain. This feature does not provision domains/certificates, merge data, add independent subscriptions or promise cross-domain SSO.

### Invitations, waitlist and account claim

AuthService requires the initiating `ctx.experience` for branded issuance in
explicit-registry mode. AuthModule injects the same registry and
`infra.experienceFlows`; direct service compositions pass those through its final
presentation options. Missing/invalid context is rejected before Membership or
claim-email writes. Ordinary actor/list operations and raw owned waitlist-code
creation remain presentation-neutral; link/email issuance is the presentation boundary.

Organization invitation emails and waitlist signup links carry a resource-bound
`experienceFlow`. Custom frontends must preserve it through invitation reads,
acceptance, waitlist validation and password signup (`X-M5kdev-Experience-Flow`).
Social signup transports it as opaque additionalData only at initiation; Auth
validates the resource/proof and stores approved continuation values in OAuth
serverContext. Callback hooks never trust client-supplied Experience fields or
raw additionalData instead of that state. Bound host/Origin checks protect User,
Account and Session writes and provider-error redirects, including a shared API
with no browser Origin. The complete shared frontend does this automatically.
Signed service reads and accepts also validate `ctx.req` against the same registry
using `validateBoundRequest`: an A proof cannot select A on a separate B/C-only
shared API. Trusted direct calls without an HTTP request can use explicit or
signed context.

Use `auth.createOrganizationInvitationLink({ id, path? })` for a manager's copy
action and `auth.createWaitlistLink({ id })` for an owned share code. Each operation
checks the current resource, authority, expiry and presentation, then issues a
canonical signed link. A configured custom local accept path is allowed; another
origin is rejected. Public readers do not mint proofs or relabel links. Fresh
explicit authorized issuance can choose a different Experience for the same
still-pending underlying resource; an existing signed continuation keeps its own
identity. MemberId, invited email and current Membership role stay authoritative.

`EmailService.sendWaitlistInvite` and `sendWaitlistUserInvite` cannot create an
Auth proof from a raw code. In strict registry mode pass the complete Auth-issued
link as `options.linkPaths.url`; omitting it returns an error before mail. Prefer
Auth's issuing operations, which own the resource checks and signed continuation.
The public raw-code helpers retain their old shorthand behavior. Email does not
validate resource ownership or mint proofs for these helpers.

Waitlist confirmation and system notification use the entered request Experience.
The selected email profile's systemNotificationEmail overrides the existing global
recipient, and its admin link uses that Experience. Strict context-free admin/API
calls require trusted explicit context; this does not infer a background
communication policy from recipient email. Existing locale/default behavior stays
unchanged, and visiting a brand never writes User preferences.

Account-claim magic links remain administrator-readable stored URLs, not newly
emailed messages. Generation scopes both email updates and stored-link retrieval
to the requested claim and issuance. The actual magic token is bound to its own
canonical callback; `claimFlow` separately binds post-login operations to the claim
and User. Preserve `claim`, `claimFlow` and the complete magic callback. Strict
post-login operations require the original claim reference even under legacy
admission; they never choose another pending claim by recency. Password
creation, provider linking and claim completion verify this continuation before
credential or claim effects. Revoked/expired claims, changed owner email and
another User at a recycled email cannot use an old link to sign in. Existing
Better Auth token consumption still enforces one-use login.

Raw outstanding links remain supported in shorthand. Explicit adoption can reuse
experienceFlowLegacyPolicy: invitation createdAt, waitlist updatedAt (or createdAt
before any rotation), claim createdAt and the original magic token's trusted
issuance time gate eligibility. Rotating a waitlist code stamps new updatedAt, so
it cannot inherit an older row's legacy allowance. Invalid supplied proofs never
downgrade to legacy; other Experiences, newer issuance and elapsed acceptance
deadlines fail closed. No new tables or metadata migration are needed.

### Checkout

Existing `new BillingModule({ stripe, checkoutSessionCreate }, plans)` authoring stays
supported. Add server-only `resolveCheckoutSessionCreate(context)` for per-Experience
presentation; defaults → static → contextual merge retains full app override power.
The callback sees approved Experience, fresh authorized browser source, Organization
currency/locale/Customer/environment and effective Price/Seat/Trial values. Browser
inputs remain catalog Price plus optional local return; no arbitrary Stripe params.

Use the canonical authenticated API/proxy for GET Checkout initiation. A distinct
shared API uses `billing.startCheckout` tRPC POST with registered browser Origin;
neutral ambiguous GET and alias/web-only starts fail. New signed returns bind the
original User/session/active Organization and live Owner, validate actual Stripe
Checkout Session nonce/customer/environment/completion and proof expiry, then reconcile before
returning to the stored product destination. Cancellation has no billing effects.
Changed context requires reopening Billing and never switches the session Org.

A usable normalized stable `BETTER_AUTH_SECRET` now supplies the shared signer even
with shorthand metadata; no new registry authoring is required. Short/missing legacy
keys keep the old raw convenience path; explicit/strict invalid keys fail and no
weak/random key is generated. Existing raw Auth links stay keyed to strictness.
Old raw payment returns are supported only as fresh-Owner current-Organization
reconciliation in nonstrict mode. Strict adoption rejects them; verified webhooks
continue reconciliation and the User can reopen Billing. Malformed/partial new
proofs never downgrade to legacy and no old issuance timestamp is invented.

Custom success/cancel URLs bypass normal correlation; changing Customer/nonce
metadata while retaining the handler can fail closed. Such app-owned overlays keep
winning and webhook sync continues. Direct service/Repository compositions inject
normalized runtime dependencies/approved Checkout URLs explicitly. See
`apps/docs/docs/modules/billing/index.md` and ADR-0027 for exact APIs and sandbox
smoke instructions. Portal adds `resolveBillingPortalSessionCreate` beside its static
bag with the same precedence. Browser source retains the exact original
User/session/Member/active Organization; trial-ending source carries verified
event/Subscription ids without a fabricated browser and requires a current live
Owner of the signed active Organization on return. Both use current environment
Customer mapping and reconcile only the signed original resource. The callback
receives the approved descriptor selected once by Email communication policy.
Portal return uses `/stripe/portal/return`, separate purpose and a 24-hour proof;
shared API browser start is `billing.startPortal` tRPC POST. No Portal retrieve API
exists: the handler cannot attest which external Session/customer was visited.
Trusted Customer/return overrides remain unbounded and app-owned; normal return
still reconciles only its originally signed authoritative Customer. Repeated valid
returns are idempotent reconciliation. Trial warning suppression is process-local
and sequential after successful delivery, not durable/concurrent exactly-once.
Existing card/no-recipient/optional-template skips remain no-ops before Portal.
Portal configuration supports only Stripe's permitted per-session fields; account
identity/appearance/custom-domain/Stripe-email limits remain explicit.

Direct Portal Repository composition supplies approved `portalReturnUrl`; no
runtime Portal or trial link reader uses a singular environment URL. No-registry
custom compositions must supply the normalized presentation contract before
sending a branded warning; do not invent a default identity. Supported app
shorthand with valid name/URLs still needs no registry authoring, and missing/short
legacy runtime keys retain their documented raw convenience limit.

## Frontend composition and shared billing controls

Import the public bootstrap helper from its supported package boundary:

```ts
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";

const experience = await loadExperience({ url: "/app/experience" });
// Then render the app's normal NuqsAdapter, BrowserRouter and Providers.
// In Providers, AppConfigProvider precedes AuthProvider and query providers.
// <AppConfigProvider config={{ experience, locales, roles }}>...</AppConfigProvider>
```

Normal Starter Providers perform this bootstrap before Auth, then select its
header, title, logo and Help destination from the resolved descriptor. Loading and
retry screens precede session loading. The server and native composition retain
single-Experience authoring without adding Billing or example product routing.
`VITE_SERVER_URL` is a web bootstrap transport input only;
selected canonical URLs drive subsequent clients. For one multi-domain web artifact
prefer relative `/app/experience` through each domain-local API proxy. Separately
hosted clients can supply `experience` to Starter Providers or supply an explicit
`bootstrapUrl` for the registered API transport. Native Starter keeps its explicit
standalone `APP_NAME` + `EXPO_PUBLIC_APP_URL` + `EXPO_PUBLIC_SERVER_URL` composition
form. Its authored frontend URL supplies verification/recovery destinations and
must be allowed by the server's trusted origins/CORS. For strict native/web-export
composition, replace that singular provider with the provided native
`ExperienceBootstrap` before Auth; register the actual frontend/API pairing in the
server registry. Never override a strict descriptor with a client URL or infer
strictness from an Experience id. Expo preserves reset, invitation,
waitlist and claim continuation ids/proofs; its browser export tests do not prove
native device OAuth/custom-scheme cookie behavior.

Keep bootstrap loading and failure explicit. Do not start authentication or render
another configured brand while resolution is pending or has failed. A separately
hosted frontend may receive the matching public descriptor from trusted app
composition and pass it directly; it need not fetch it again. `AppConfigProvider`
validates that descriptor. Passing any singular `appName`, `appUrl` or `serverUrl`
field together with `experience` is rejected, including from JavaScript callers.
Existing singular provider configuration remains supported.

Apps explicitly select their route tree and shell from the product key. A second
Brand Profile for the same product reuses that route tree and workflow components.
Organization, Plan, Entitlement and Grant changes never select the product.
Keep approved theme/copy identifiers in app-owned lookup tables, rather than
executing configuration as HTML, CSS or code.

Shared Checkout and Portal buttons invoke `billing.startCheckout` and
`billing.startPortal` through the authenticated tRPC client before navigating to
the returned Stripe URL. The browser POST supplies its Origin to a shared API;
a top-level GET link normally does not. Custom frontend integrations should use
those operations with the currently active `organizationId` and the documented
Price/local-return inputs. Do not send Stripe parameter bags or Customer ids.
The old server GET routes remain available for supported domain-local integrations.
A shared API still requires a working authenticated cookie topology; this does
not add cross-domain SSO.

Members, child Organizations and Organization preferences also include their active
Organization id and discard previous-Organization placeholders. Preference mutations
update the cache named by their original mutation input. User-owned Organization
lists and saved User preferences stay User-scoped.

Subscription, invoice, trial-price and Entitlement queries are scoped by
Organization id. Entitlements deliberately do not acquire an Experience key.
Pending, failed or previous-Organization results withhold allowance from
`useEntitlement`, even when a previous successful snapshot remains cached.
`BillingProvider` accepts `errorPage` separately from `planPage`; shared paywalls
show a load error rather than a purchase prompt when a billing query fails.
App-owned caches of genuinely branded data must include the Experience and
relevant locale; do not partition unrelated Organization authority data or clear
all query caches on a brand change. Backend checks remain authoritative.

The private `apps/experience-reference` composition exercises one compiled SPA
under two products and an alternate brand of the first product, using the real
Kernel, Better Auth, tRPC and Billing/Grant services. It is excluded from Starter
scaffolding. Its README describes the disposable PostgreSQL/browser commands,
domain-local and shared-API topologies, supplied-descriptor example and recording
Stripe boundary.

## File URLs, caches and neutral infrastructure

File ownership continues to use User/Organization plus bucket/key. Local mock-S3
upload/download URLs use the approved request Experience's canonical API origin via
an immutable per-call store view, so another unrelated product domain can reach
its own mock endpoint. Neutral server calls use normalized infrastructure defaults;
deployed S3 URLs are unchanged. Local storage itself is not partitioned by brand.

Ordinary tRPC JSON responses, including batches and errors, are private/no-store;
this includes Entitlements, Subscriptions and public proof-bound resource reads.
Authenticated Express routes and their errors/redirects are private/no-store at
the Auth transport boundary; Auth's session endpoint is no-store. Public static assets keep their normal policy.
MCP discovery/issuer/JWKS remain canonical/default, and no-Origin neutral workers
and API operations acquire no invented browser identity.

## Cutover and verification

Retain both old Experience ids **and their original canonical web/API origins**
until outstanding signed links and queued work have drained or been explicitly
migrated. Merely retaining the old web address as an alias after changing
`webOrigin` does not preserve signatures for its old canonical destination. Create
a new Experience for a new canonical origin while old continuations drain.

Use the bounded legacy policy only with authoritative issuance timestamps as
specified above. Strict raw historical payment returns have no trustworthy issuance
record and fail closed: rely on verified webhook reconciliation and reopen Billing.
Do not reinterpret malformed signed input as an older raw flow. Background jobs
without ids use an explicit trusted communication policy during strict adoption.
Preserve app-authored guides and every configured locale when updating generated
apps; CLI update does not replace authored guides/translations.

Run `node scripts/check-experience-readers.mjs` to check the bounded runtime-reader
inventory, then `node scripts/verify-experiences.mjs` with the explicit disposable
PostgreSQL and owned Redis environment variables described by the reference README.
The same compiled fixture covers A/B/alternate branding, actual Auth and resource
continuations, Connection provider callbacks, Checkout/Portal return reconciliation,
interleaved immediate and delayed emails, and verified webhook trial warnings.
Recording adapters are restricted to provider/Stripe boundaries. Existing broad
negative-flow suites run alongside it. Generated-consumer evidence must use freshly
packed current-branch packages, not registry copies with the same version number.

Hosted Stripe branding, payments, invoices/receipts and external email appearance
require real sandbox access; the documented Billing sandbox checklist remains the
manual verification boundary when credentials are unavailable. This feature does
not merge User/data records or subscriptions, provision customer-managed domains or
certificates, add cross-domain SSO, create multiple Stripe accounts, or select a
Trial Plan by Experience. ADR-0034 remains the commercial authority.


## Communication and local composition edge contracts

Notification email jobs carry `{ notificationId, experienceId? }`, never a full
request, recipient snapshot or Brand Profile. An owning server service may pass an
approved `experienceId` to `NotificationService.send` for an entered-Experience
email. The worker resolves that exact id again; removed/disabled/invalid supplied
references fail delivery without policy fallback. With no reference, the real
EmailService communication policy receives `event: "notification.email"`, the
Notification id as eventId/resourceId and the current User/Member/Organization ids.
The worker reloads the active Membership and matching available User, current email
and locale. Notification data is never presentation or membership authority.
Failed delivery is recorded in its send log. Existing custom three-argument senders
and registry-free standalone EmailService remain supported; they need no new
resolver. Strict email delivery requires either explicit selection or the app's
communication policy.

Waitlist joining returns the committed registration even if confirmation/system
mail fails; failures retain waitlist id and communication diagnostics. Concurrent
and case-normalized retries reuse one pending public WAITLIST registration without
repeating notifications. Historical invitation/code rows are not disclosed or
rewritten; no generic outbox or automatic delivery guarantee is introduced.

Configured Connection OAuth providers require both public origins at module boot,
including local development: `app.urls.web` / `VITE_APP_URL` and `app.urls.api` /
`VITE_SERVER_URL`. A generic API-only Kernel, empty Connect module and headless
Billing webhook/sync use remain valid. Browser Billing starts without presentation
fail with this configuration guidance. Registered Connection callback queries may
retain provider-specific nonreserved parameters, but cannot predefine any field
owned by the callback input schema (state/code/error/provider/redirect fields).

Unsigned shorthand browser Billing preserves its existing default and trusted
static overlays. A caller-supplied `returnPath` requires a usable stable flow signer;
otherwise Checkout/Portal start rejects before creating a Stripe Session rather
than discarding the destination.

Direct `createMcpExpressHandler` / `mountMcpHttp` composition with dynamic Better
Auth must pass the explicit canonical Auth `issuer`, independently of the protected
resource origin. Kernel wiring supplies it. A resolved static Auth baseURL retains
precedence, including supported custom paths; an empty dynamic context never
infers issuer from resource origin. Signature, issuer, audience and expiry checks
remain required, with no Experience gate on ordinary MCP tools.

Claim status reports `hasPassword` only after validating the exact authenticated
claim continuation. Web and Expo use it to resume acceptance after a committed
credential change, including reload; set-password is not weakened or made to
accept arbitrary existing credentials. Public invalid magic-link send requests
return the same success response for known and unknown emails and deliver no
usable link. Recovery invalid-token/continuation errors are classified separately
from password-policy errors, so a rejected password can reuse its valid link.
