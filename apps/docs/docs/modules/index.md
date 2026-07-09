---
sidebar_position: 1
---

# Modules

Modules are the preferred way to read detailed m5kdev docs. A module can span
shared schemas, backend services, frontend hooks, and reusable UI.

## Core

| Module | Packages | What it does |
| --- | --- | --- |
| [Auth](/modules/auth) | commons, backend, frontend, web-ui | Better Auth wiring, users, organizations, waitlists, invitations, settings storage, and full auth UI |
| [Base](/modules/base) | commons, backend | Framework core: module contract, services, actors, grants, procedures, result pattern |
| [App shell](/modules/app) | frontend, web-ui | App config, typed tRPC + query providers, shell and sidebar UI |
| [Billing](/modules/billing) | commons, backend, frontend, web-ui | Stripe plans, checkout/portal, webhook-driven subscription sync, plan UI |
| [File](/modules/file) | commons, backend, frontend | Browser uploads, presigned S3 URLs, upload inventory, download resolution |
| [Table](/modules/table) | commons, frontend, web-ui | Shared list query contract, URL query state, table UI |

## Services

| Module | Packages | What it does |
| --- | --- | --- |
| [AI](/modules/ai) | commons, backend | Mastra agents, OpenRouter generation, embeddings, image generation, usage tracking |
| [Workflow](/modules/workflow) | commons, backend | BullMQ jobs and cron schedules with persisted run tracking |
| [Notification](/modules/notification) | commons, backend | Web Push / APNs / FCM delivery with device registry and send logs |
| [Email](/modules/email) | backend, email | React Email templates over Resend, locale-aware sends, dev preview |
| [Recurrence](/modules/recurrence) | commons, backend | Recurring schedules and rules with permissioned CRUD |
| [Tag](/modules/tag) | commons, backend | Polymorphic tags and taggings for any resource type |
| [Connect](/modules/connect) | backend | OAuth account linking for third-party APIs (Google, LinkedIn) |
| [Social](/modules/social) | backend | Posting to social networks through linked accounts |
| [Webhook](/modules/webhook) | backend | One-shot inbound webhook callbacks with awaitable payloads |
| [Clay](/modules/clay) | backend | Clay table integration built on the webhook module |
| [Access](/modules/access) | backend | Statement-based permission checks on Better Auth access control |
| [Crypto](/modules/crypto) | backend | Bitcoin address derivation and payment tracking |

## Utilities

| Module | Packages | What it does |
| --- | --- | --- |
| [Schemas](/modules/schemas) | commons | Shared list query contract (`querySchema`, filters) |
| [Utils](/modules/utils) | backend | Drizzle query helpers for pagination, sorting, filtering, search |
| [Docx](/modules/docx) | backend | Word-to-Markdown conversion |
| [PDF](/modules/pdf) | backend | PDF text extraction |
| [Video](/modules/video) | backend | ffmpeg trimming and audio extraction |
| [Operations](/modules/operations) | frontend | Reserved for long-running operation hooks (empty today) |
| [Uploads](/modules/uploads) | backend | Runtime upload working directory (not a code module) |
