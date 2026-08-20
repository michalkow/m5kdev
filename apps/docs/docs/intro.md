---
slug: /
sidebar_position: 1
---

# m5kdev documentation

m5kdev is an opinionated TypeScript framework for building AI SaaS applications.
It is a pnpm/Turborepo monorepo of packages you compose into apps: a backend app
kernel, shared contracts, frontend hooks, and a reusable web UI library.

## Stack philosophy

m5kdev is deliberately **not** technology-agnostic. Most frameworks stay neutral
about databases, auth, queues, and UI so they can serve every possible stack — and
in exchange they stop at wiring, leaving every product decision to you. m5kdev
takes the opposite trade: one chosen stack, integrated end to end.

That choice is what lets the framework go further than wiring:

- **It ships its own database schemas.** Modules like auth, billing, files,
  notifications, tags, and workflows come with Drizzle tables out of the box —
  users, organizations, members, invitations, subscriptions, upload inventory,
  notification devices, and more. You migrate them into your app database and
  build on top instead of designing the same tables for the tenth time.
- **It ships the common business logic of AI SaaS apps.** Waitlists and invite
  codes, organization membership and roles, Stripe subscription sync, presigned
  S3 uploads, web push delivery, background jobs with cron schedules, LLM calls
  with usage tracking — the services every AI SaaS ends up writing are already
  implemented as composable backend modules.
- **Extension over abstraction.** Modules are class-based and extensible; apps
  override grants, hooks, and services rather than swapping out infrastructure.

### The chosen stack

| Concern | Choice |
| --- | --- |
| Language / runtime | TypeScript, Node.js >= 24 |
| Monorepo | pnpm workspaces + Turborepo |
| HTTP server | Express |
| API | tRPC (typed end to end via `AppRouter`) |
| Database | Drizzle ORM on libSQL/SQLite |
| Auth | Better Auth (organizations, invitations, API keys, admin) |
| Jobs / queues | BullMQ on Redis |
| Email | Resend + React Email templates |
| Payments | Stripe |
| File storage | AWS S3 (presigned uploads) + local uploads |
| AI | Mastra agents, OpenRouter models, Replicate, Ideogram |
| Error handling | `neverthrow` results (`ServerResult` / `ServerResultAsync`) |
| Frontend | React 19, react-router v7, TanStack Query over tRPC |
| URL state | nuqs |
| UI | HeroUI + Tailwind CSS v4 |
| i18n | i18next (backend emails and frontend UI) |

If you want a different database, auth provider, or UI kit, m5kdev is the wrong
tool — that is by design.

## Organizations as default

Every user belongs to at least one **organization**. That is the tenancy model,
not an optional multi-tenant feature. Single-user products still get an org at
signup (it can stay invisible in the UI). Org-scoped assets should attribute and
authorize with **`memberId`**; personal resources (billing, devices, OAuth) stay
on **`userId`**.

See [Organizations and members](/guides/organizations-and-members) for intended
usage, and the
[member ownership migration](/guides/v0.32.0-memberid-ownership-migration) when
upgrading an existing app.

List endpoints use **List query** (QueryFilters) or **Match query**
(QueryMatch). Table UI stays QueryFilters.
[List query and Match query](/guides/list-query-and-match-query).

The Kernel owns Express JSON, CORS, listen, and signal shutdown.
[Kernel Express HTTP shell](/guides/v0.33.0-kernel-express-http-shell-migration).

Scaffolded apps stay on the framework catalog pins; boundary libraries are
peers so TypeScript sees one physical copy.
[Catalog lockstep](/guides/v0.33.0-catalog-lockstep-migration).

## Read by module

Use the module docs when you are adding a feature to an app. Start with the
[module index](/modules). Docs group **Kernel infrastructure**, **Core Modules**,
and **Optional Backend Modules**; Table, App shell, and Schemas stay
Shared-contract / UI surfaces.

## Read by package

Use the package docs when you need to understand ownership, exports, and where
code should live.

- [Backend package](/packages/backend) owns server modules, repositories,
  services, tRPC fragments, Express hooks, jobs, and app-kernel composition.
- [Frontend package](/packages/frontend) owns shared React hooks and client-side
  module logic.
- [Web UI package](/packages/web-ui) owns reusable HeroUI/Tailwind components.
- [Commons package](/packages/commons) owns shared constants, schemas, and types.

## Local commands

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```
