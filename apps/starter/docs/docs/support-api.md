---
sidebar_position: 10
title: Support API
---

The signed-in Support API is available under `/api/v1/support` on the application's API origin. It provides the same operations used by the web widget and Support desk. A React Native widget is not included; native clients can use this JSON interface.

## Authenticate

Use the application's existing Better Auth User credentials. For a native client:

1. Send `POST /api/auth/sign-in/email` with JSON `{ "email": "you@example.com", "password": "your password" }`.
2. Store the signed session from the `set-auth-token` response header in your platform's secure storage.
3. Send `Authorization: Bearer <signed-session>` on Support requests.
4. Use `GET /api/auth/get-session` to check the session and `POST /api/auth/sign-out` to revoke it. Expired or revoked sessions require sign-in again.

Browser clients use their existing session cookie. Do not embed platform admin API keys in a customer widget. Access is checked against the current User and platform role; an organisation ID cannot grant access to another User's Case.

## Contract and messages

Fetch `GET /api/v1/support/openapi.json` for the current OpenAPI 3.1 schemas, query parameters, inputs, outputs and operation IDs. JSON timestamps are ISO date/time strings. All successful operations return HTTP 200.

```json
POST /api/v1/support/cases
{
  "clientId": "unique-request-id",
  "subject": "Invoice help",
  "body": "I need help with my invoice",
  "uiLocale": "en"
}
```

Keep the same `clientId` and payload when retrying a create/send after a network failure. Reusing that ID with different content returns 409. Use a new ID for each genuinely new message.

| Method and path | Operation | Access |
| --- | --- | --- |
| `POST /cases` | Create Case; admins may supply recipient `userId` | User/staff |
| `GET /cases` | List/search/filter Cases | Own Cases or platform staff |
| `GET /cases/{id}` | Bounded history; `beforeSequence` loads older messages | Participant/staff |
| `POST /cases/{id}/messages` | Send text, reserved `attachmentIds`, optional staff note/translation preview | Participant/staff |
| `GET /cases/{id}/changes` | Durable change cursor, changed messages and state | Participant/staff |
| `POST /cases/{id}/read` | Advance monotonic `throughSequence` | Participant/staff |
| `POST /cases/{id}/state` | Resolve/reopen; staff assignment, priority, wait, snooze and handling | User/staff by field |
| `POST /cases/{id}/human` | Request human help | Participant/staff |
| `POST /cases/{id}/language` | Set explicit support language, or `null` for detection/fallback | Participant/staff |
| `POST /cases/{id}/uploads` | Reserve a File upload | Participant/staff |
| `POST /cases/{id}/download` | Get a currently authorised short-lived File URL | Participant/staff |
| `POST /cases/{id}/redact` | Audit-redact a message and revoke its Files | Staff |
| `POST /cases/{id}/translate` | Request an additional viewing translation | Participant/staff |
| `POST /cases/{id}/publication` | Retry, send original or publish a translation preview | Staff |
| `POST /cases/{id}/feedback` | Rate the current genuine resolved cycle | Requesting User |
| `GET /cases/{id}/metrics` | Retained publication/resolution facts | Staff |
| `GET /catalog`, `POST /catalog` | Shared Tags and saved replies | Staff |
| `POST /cases/{id}/tags` | Replace shared Tag assignments | Staff |
| `GET /settings`, `POST /settings` | Settings, feature switches, explicit budgets and versioned hours | Staff |
| `POST /working-locale` | Staff working locale | Staff |
| `GET /unread` | Total unread indicator | Signed-in User/staff |
| `GET /availability` | Human hours, expectation and supported languages | Signed-in User |
| `GET /overview` | Queue counts and bounded response/CSAT cohorts | Staff |
| `GET /documentation`, `POST /documentation` | Inspect/stage a complete documentation manifest | Staff |
| `POST /documentation/withdraw` | Withdraw a documentation release | Staff |

State and Tag edits include `expectedVersion` from the current Case. Settings edits include their settings version. Refetch after 409 before intentionally applying a new edit. Public messages are immutable; corrections are new messages. Customer reads never return Internal notes, pending staff replies, or their Files.

## Reconnect and attachments

`GET /cases` returns `items` and a next-page `cursor`; keep the same filters and follow that cursor to browse the complete Case list.

`GET /cases/{id}` returns a history page, whether older messages exist, and a durable change cursor. Save the cursor, then call `GET /cases/{id}/changes?cursor=...` after reconnect or app resume. Apply changed messages by ID, including redaction tombstones, and replace the returned Case state. Follow `hasMore` until caught up, saving each returned cursor. Hidden staff-note positions do not represent missing public messages.

Kernel Server events are optional hints containing identifiers. They have no replay guarantee; always recover through HTTP. A client may poll the change endpoint without WebSockets or Server events. The framework repository includes `scripts/support-native-reference.mjs`, a plain JavaScript reference for login and operation calls.

For attachments, call `initiateAttachment` (`POST /cases/{id}/uploads`), upload bytes directly to its returned URL with the declared Content-Type, then include its `fileId` in `attachmentIds` when sending a message. The server verifies the actual bytes before publication. The default is five files per message, 10 MiB each: JPEG, PNG, WebP, PDF and text/logs. Obtain each download through the Support API; generic File permissions do not replace Case access. A redaction response reports whether storage cleanup is pending.

## Errors and automation

400 means invalid input or unavailable configuration; 401 means the session is missing, expired, revoked or no longer authorised; 403 means the current operation is forbidden; 404 means the resource is unavailable; 409 means an idempotency/revision conflict or pending cleanup; 429 means a rate limit. Server errors do not expose private transcript content. Preserve drafts and request IDs on transient failures.

A message's `acceptedAt` differs from `publishedAt`. Only a non-null publication timestamp means the customer can read the reply. Staff can retry failed translation or explicitly publish the original; optional previews wait for publication. AI and translation use independent configured limits. Exhaustion preserves human support. Human requests, changed permissions, Close/Restore and changed sources invalidate pending autonomous publication.
