---
sidebar_position: 14
---

# Connection module

Connection is a Core Module for linking third-party API accounts (Google, LinkedIn).
The module id and table stay `connect`. This is not Better Auth login OAuth
(`/api/auth/*` and the `accounts` table) — login stays on [Auth](/modules/auth).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | Connection DB tables, DTOs, OAuth helpers, provider adapters, repository, service, routes, and tRPC procedures. |

## How it works

1. Register `ConnectModule` with `createBackendApp` and one or more provider factories.
2. A logged-in user starts linking on the canonical authenticated API authority via `GET /connect/:provider/start?redirect=<local-return>`.
3. After provider consent, the callback upserts tokens and profile metadata into the `connect` table.
4. Use `connect.list` (tRPC) to show linked accounts; tokens are omitted from API responses.
5. Internal consumers can call `ConnectService.refreshToken(connectionId)` before API use.

## Module registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { ConnectModule } from "@m5kdev/backend/modules/connect/connect.module";
import { createGoogleProvider } from "@m5kdev/backend/modules/connect/connect.google";
import { createLinkedInProvider } from "@m5kdev/backend/modules/connect/connect.linkedin";

createBackendApp(config, [
  new ConnectModule([createLinkedInProvider(), createGoogleProvider()]),
]);
```

## Google Drive (read-only)

The Google provider requests Drive read access and stores refreshable OAuth tokens for long-lived API use.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| App API origin | Canonical API origin from `createBackendApp` app configuration; legacy environment defaults are normalized there |

Redirect URI registered in Google Cloud Console:

```
{canonical-api-origin}/connect/google/callback
```

### Google Cloud Console setup

1. Create or select a Google Cloud project.
2. Enable the **Google Drive API**.
3. Configure the OAuth consent screen (add `.../auth/drive.readonly` scope if prompted).
4. Create an OAuth 2.0 client (type: **Web application**).
5. Add the authorized redirect URI above.
6. Copy the client ID and secret into your app environment.

### Scopes

- `openid`, `email`, `profile` — user identity for the linked account
- `https://www.googleapis.com/auth/drive.readonly` — read-only Drive access

The provider sends `access_type=offline` and `prompt=consent` so the first successful link stores a refresh token.

### Linking flow

While authenticated, redirect the user to:

```
GET /connect/google/start?redirect=%2Fsettings
```

On success, the user is redirected to `redirect` with `connect_success=true&provider=google`.

## LinkedIn

Requires `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. Register the callback derived from app configuration:

```
{canonical-api-origin}/connect/linkedin/callback
```


## Domains, callbacks and return destinations

`ConnectModule` derives each provider callback from the selected Experience's
canonical API origin and the module's `mountPath` (default `/connect`). With
`mountPath: "/connections"`, Google uses
`https://your-api.example/connections/google/callback`. Register every derived
canonical callback with the provider before enabling those Experiences. Provider
factories no longer read `VITE_SERVER_URL`; existing app name/URL/environment
configuration remains the supported single-Experience shorthand.

For unrelated product domains, prefer a same-origin API/auth proxy on each domain.
The User must be authenticated on the **same canonical API authority** used by its
provider callback. In strict Experience mode, starting on a web-only domain or an
alias is rejected: a host-only session on that host would not reach the canonical
callback. Enter and sign in through the canonical website/API before linking.
Aliases still resolve public Experience configuration; they do not provide SSO or
transfer cookies. Do not route product B through product A's cookies.

A shared API can select an Experience from its registered browser Origin when
starting. Top-level navigation to a distinct shared API usually sends no Origin;
an ambiguous start is rejected rather than choosing a default brand. Use the
domain-local proxy, or a trusted server integration with explicit validated context.
Callbacks may omit Origin: private state supplies the Experience, which is checked
against the API/Origin relationship configured for that host. A conflicting actual
Origin or another Experience's callback cannot replace it.

Custom providers can keep an explicit registered `redirectUri`. In strict mode its
origin and path must match that Experience's canonical API callback route; a fixed
registered query is retained exactly through authorization and token exchange.
For explicit per-Experience values, use `redirectUris`:

```ts
createGoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUris: {
    productA: "https://a.example/connect/google/callback",
    productB: "https://b.example/connect/google/callback",
  },
});
```

Omitting callback overrides derives them from app configuration. Explicit client
credentials can also be passed to either factory; the existing environment
credential convenience remains. Callback topology is validated at boot. OAuth
`authorizationExtraParams` cannot replace state, redirect URI, client id, response
type, scopes, PKCE or nonce parameters; configure scopes in `scopes`.

The start `redirect` can be a local path or an absolute URL within the selected
canonical web origin. External, protocol-relative (including same-host forms),
malformed and repeated values are rejected. The local destination is stored with
the original User, session, provider, callback URI, PKCE and expiry. Callback query
`redirect`/Experience values cannot relabel that flow. Success adds
`connect_success=true&provider=<provider>` to the stored destination. A provider
cancellation or exchange/profile failure adds `error=CONNECTION_FAILED&provider=...`
there, without displaying technical provider details. Missing/invalid/expired or
replayed state produces a safe400 response without an unbound redirect. Callback
still requires the original authenticated User/session; this module does not
recover identity from a website name.

## State lifetime and service consumers

State is an opaque random nonce backed by private **per-app in-memory** storage,
with PKCE, a checked ten-minute expiry and atomic one-use consumption. Concurrent
starts for one session/provider remain independent, and cancellation consumes its
state too. This release requires instance affinity between start and callback;
worker restart/deployment loses pending state, so the User starts again. It does
not provide distributed Redis state or a new flow/Experience table. A signed
presentation value alone would not recover the private PKCE verifier or prevent
replay.

Reconnect uses the same authorization flow and updates the User's existing row for
the provider account. Listing/unlinking retain their current User/grant rules;
unlink removes the local Connection and does not call a provider revocation API.
Internal refresh and Social consumers need no browser Experience. Linking never
selects an Organization or grants a paid Capability, and MCP authority is unchanged.

Direct service integrations now call `startAuth(input, context)` and
`handleCallback(input, context)`. Inputs are the exported Connection DTO types;
`ConnectFlowContext` supplies authenticated `{ user, sessionId, experience, request }`.
Construct direct services with the app-owned registry and mountPath in the fourth
constructor argument; `ConnectModule` injects these automatically. Pass actual
request headers at HTTP boundaries. Completion returns a typed navigation outcome
and canonical URL; read linked rows through the existing list operation. The old
module-global state helpers are replaced by an app-owned `OAuthStateStore`; do not
share it across apps or serialize its private PKCE/session data into browser state.

## tRPC procedures

| Procedure | Auth | Description |
| --- | --- | --- |
| `connect.list` | Required | List connections for the current user (tokens omitted) |
| `connect.delete` | Required + delete grant | Remove a connection by id |

OAuth start/callback routes are Express-only (`/connect/:provider/start`, `/connect/:provider/callback`).
