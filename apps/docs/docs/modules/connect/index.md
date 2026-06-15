---
sidebar_position: 14
---

# Connect module

The connect module handles backend OAuth-style provider connections for third-party APIs (account linking). It is separate from Better Auth login OAuth (`/api/auth/*`).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | Connect DB tables, DTOs, OAuth helpers, provider adapters, repository, service, routes, and tRPC procedures. |

## How it works

1. Register `ConnectModule` in your app kernel with one or more provider factories.
2. A logged-in user starts linking via `GET /connect/:provider/start?redirect=<app-url>`.
3. After provider consent, the callback upserts tokens and profile metadata into the `connect` table.
4. Use `connect.list` (tRPC) to show linked accounts; tokens are omitted from API responses.
5. Internal consumers can call `ConnectService.refreshToken(connectionId)` before API use.

## Module registration

```typescript
import { ConnectModule } from "@m5kdev/backend/modules/connect/connect.module";
import { createGoogleProvider } from "@m5kdev/backend/modules/connect/connect.google";
import { createLinkedInProvider } from "@m5kdev/backend/modules/connect/connect.linkedin";

const connectModule = new ConnectModule([
  createLinkedInProvider(),
  createGoogleProvider(),
]);

// kernel.use(connectModule)
```

## Google Drive (read-only)

The Google provider requests Drive read access and stores refreshable OAuth tokens for long-lived API use.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `VITE_SERVER_URL` | Server base URL (used for redirect URI) |

Redirect URI registered in Google Cloud Console:

```
{VITE_SERVER_URL}/connect/google/callback
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
GET /connect/google/start?redirect=https://your-app.example/settings
```

On success, the user is redirected to `redirect` with `connect_success=true&provider=google`.

## LinkedIn

Requires `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `VITE_SERVER_URL`. Redirect URI:

```
{VITE_SERVER_URL}/connect/linkedin/callback
```

## tRPC procedures

| Procedure | Auth | Description |
| --- | --- | --- |
| `connect.list` | Required | List connections for the current user (tokens omitted) |
| `connect.delete` | Required + delete grant | Remove a connection by id |

OAuth start/callback routes are Express-only (`/connect/:provider/start`, `/connect/:provider/callback`).
