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

createBackendApp(config, [new WebhookModule("/webhook")]); // mount path, default "/webhook"
```

## How it works

1. A service calls `waitForRequest<T>(callback, timeoutSec)`. The module creates
   a pending `webhook` row and passes the callback URL to your `callback`
   function, which triggers the external system.
2. The external system eventually POSTs to the callback URL; the route handler
   calls `completed(id, payload)` to store the payload and mark the row done.
3. `waitForRequest` resolves with the typed payload, or fails after
   `timeoutSec` (default 60s).

This request/response-over-webhook pattern is what the
[Clay module](/modules/clay) builds on.

## Service API

| Method | Description |
| --- | --- |
| `waitForRequest<T>(callback, timeoutSec?)` | Create a webhook, trigger the caller-provided side effect, await the payload |
| `completed(id, payload)` | Mark a webhook completed with its payload |
