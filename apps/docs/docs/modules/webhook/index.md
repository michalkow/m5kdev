---
sidebar_position: 25
---

# Inbound callback module

Inbound callback is a Core Module for one-shot inbound callbacks: it mints a
callback URL, waits for an external system to hit it, and resolves with the
delivered payload. The module id and table stay `webhook`.

This is not Stripe Subscription sync. Stripe Billing hooks stay on
[Billing](/modules/billing) (`POST /webhook` with `STRIPE_WEBHOOK_SECRET`).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `WebhookModule`: `webhook` table, constants, DTOs, repository, `WebhookService`, Express callback route. |

## Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { WebhookModule } from "@m5kdev/backend/modules/webhook/webhook.module";

createBackendApp(config, [new WebhookModule("/webhook")]);
// Named Inbound Callbacks: new WebhookModule("/webhook", { adobe: process.env.ADOBE_CALLBACK_SECRET! })
```

`mountPath` defaults to `/webhook`. The second argument is the name→secret map
for Named Inbound Callbacks.

## How it works

1. A service calls `waitForRequest<T>(callback, timeoutSec?, { name?, secret? })`.
   The module creates a pending `webhook` row and passes a callback URL (including
   `?token=`) to your `callback` function, which triggers the external system.
2. The external system POSTs to that URL. The route accepts the token from
   `Authorization: Bearer` when present, otherwise from the `token` query param.
3. `waitForRequest` resolves with a `ServerResult` of the typed payload, or an
   error after `timeoutSec` (default 60s). It does not reject the Promise.

This request/response-over-webhook pattern is what the
[Clay module](/modules/clay) builds on. Clay stays untyped in 1.0: those waits
use `WEBHOOK_SECRET` as the token (and embed it in `?token=`).

### Credentials (exclusive; no cascade)

| Row | Token must equal |
| --- | --- |
| `secret` set | that row secret |
| `name` set, no secret | `secrets[name]` from the module constructor (unknown name fails at mint) |
| neither | `WEBHOOK_SECRET` (unset fails at mint) |

The minted URL origin is `NGROK_LOCALHOST_TUNNEL` if set, otherwise Kernel
`app.urls.api`. The path is the module `mountPath` plus `/{id}`.

Only `WAITING` rows can be completed. A matching token on a non-waiting row
returns 409. A missing row or wrong token returns 401. In-process
`completed(id, payload)` stays callable without the token and still requires
`WAITING`.

## Service API

| Method | Description |
| --- | --- |
| `waitForRequest<T>(callback, timeoutSec?, opts?)` | Create an Inbound callback, trigger the caller-provided side effect, await the payload as a Result |
| `completed(id, payload)` | Mark a waiting Inbound callback completed with its payload |
| `receive({ id, token, payload })` | HTTP path: verify the exclusive token, then complete |

## Related

- [Inbound callback secrets in 0.37.0](/guides/v0.37.0-inbound-callback-secrets-migration)
- [Clay](/modules/clay)
