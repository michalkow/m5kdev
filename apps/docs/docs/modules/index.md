---
sidebar_position: 1
---

# Modules

Module docs are the preferred way to read m5kdev. A page can span Kernel
infrastructure, a Core Module, an Optional Backend Module, or a Shared-contract /
UI surface.

Register Backend Modules with `createBackendApp(config, [modules])`. Kernel
infrastructure is not a Backend Module — do not pass Base to `createBackendApp`.
`AccessModule` and `CryptoModule` were removed.

## Kernel infrastructure

Not registered with `createBackendApp`. Import Base from `@m5kdev/backend/base/*`
(the `./modules/base/*` path still re-exports the same types).

| Surface | Packages | What it does |
| --- | --- | --- |
| [Base](/modules/base) | commons, backend | `BaseModule`, services, actors, Grants, procedures, result pattern, list/match query helpers |
| [Query helpers](/modules/utils) | backend | Drizzle helpers for pagination, sorting, QueryFilters, QueryMatch, search (folded into Kernel infrastructure; not a Backend Module) |

## Core Modules

Ship in `@m5kdev/backend`. Register only the ones the app boots. Auth still
requires Email.

| Module | Packages | What it does |
| --- | --- | --- |
| [Auth](/modules/auth) | commons, backend, frontend, web-ui | Better Auth wiring, users, organizations, waitlists, invitations, settings storage, and full auth UI |
| [Billing](/modules/billing) | commons, backend, frontend, web-ui | Stripe plans, checkout/portal, Stripe webhook-driven subscription sync, plan UI |
| [File](/modules/file) | commons, backend, frontend | Browser uploads, presigned S3 URLs, upload inventory, download resolution |
| [AI](/modules/ai) | commons, backend | Mastra agents, OpenRouter generation, embeddings, image generation, usage tracking |
| [Workflow](/modules/workflow) | commons, backend | BullMQ jobs and cron schedules with persisted run tracking |
| [Notification](/modules/notification) | commons, backend | Web Push / APNs / FCM delivery with device registry and send logs |
| [Email](/modules/email) | backend | `EmailModule` send orchestration over Resend, locale-aware sends, dev preview |
| [Recurrence](/modules/recurrence) | commons, backend | Recurring schedules and rules with permissioned CRUD |
| [Tag](/modules/tag) | commons, backend | Polymorphic tags and taggings for any resource type |
| [Connection](/modules/connect) | backend | Linked third-party API accounts (`id` remains `connect`) |
| [Inbound callback](/modules/webhook) | backend | One-shot inbound callbacks with awaitable payloads (`id` remains `webhook`) |

## Optional Backend Modules

Published as `@m5kdev/module-<name>`. `create-m5kdev` does not add these
packages; pin them in the Managed catalog when an app needs them.

| Module | Packages | What it does |
| --- | --- | --- |
| [Clay](/modules/clay) | `@m5kdev/module-clay` | Clay table integration on Inbound callback |
| [Docx](/modules/docx) | `@m5kdev/module-docx` | Word-to-Markdown conversion |
| [PDF](/modules/pdf) | `@m5kdev/module-pdf` | PDF text extraction |
| [Social](/modules/social) | `@m5kdev/module-social` | Posting to social networks through linked Connection accounts |
| [Video](/modules/video) | `@m5kdev/module-video` | ffmpeg trimming and audio extraction |

## Shared-contract / UI surfaces

These are not part of the Kernel / Core / Optional Backend Module split.

| Surface | Packages | What it does |
| --- | --- | --- |
| [App shell](/modules/app) | frontend, web-ui | App config, typed tRPC + query providers, shell and sidebar UI |
| [Table](/modules/table) | commons, frontend, web-ui | List query / Match query contracts, URL query state, table UI |
| [Schemas](/modules/schemas) | commons | List query (`querySchema`) and Match query (`matchQuerySchema`) |
| [Operations](/modules/operations) | frontend | Reserved long-running operation hooks (empty today; not a Backend Module) |

## Runtime directory

| Surface | Packages | What it does |
| --- | --- | --- |
| [Uploads](/modules/uploads) | backend | Runtime upload working directory (not a Backend Module) |
