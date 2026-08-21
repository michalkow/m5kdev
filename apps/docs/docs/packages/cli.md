---
sidebar_position: 7
---

# CLI package

`create-m5kdev` scaffolds apps and maintains managed consumers. Invoke an exact
release with `pnpm dlx`; do not add `create-m5kdev` to the generated app's
dependencies. The published bin is both `create-m5kdev` and `m5kdev`. Engines
are **Node.js >= 24**.

## Use it for

- Creating new apps (`create`).
- Enrolling an existing compatible app (`init`).
- Diagnostics (`doctor`) and template reconciliation (`update`).

## Commands

```sh
pnpm dlx create-m5kdev@0.34.0 [directory] [create options]
pnpm dlx create-m5kdev@0.34.0 init [--yes] [--force] [--json]
pnpm dlx create-m5kdev@0.34.0 doctor [--full] [--json]
pnpm dlx create-m5kdev@0.34.0 update [--dry-run] [--skip-install] [--json]
```

A first positional argument that is not a command is treated as `create`.

### create

| Flag | Effect |
| --- | --- |
| `--name` / `--description` | App name and description |
| `--platform` | `web` (default), `expo`, or `both` |
| `--with-test-harness` | Include the e2e harness |
| `--yes` | Accept defaults for missing prompts |
| `--force` | Allow a non-empty directory |
| `--skip-install` / `--skip-git` | Skip `pnpm install` / `git init` |

`--yes` is web + always-on only: no test harness and **no** optional Backend
Modules. There is no `--modules` flag. Interactive create prompts
comma-separated module ids (or `none`). Experimental choices are labeled in
that prompt.

Always-on in Starter: Auth, Email, Posts, Email preview, Landing, Deploy home.
Kernel infrastructure is not a selectable module.

| Id | What selecting it does |
| --- | --- |
| `files` | File module + web Files UI |
| `workflows` | Workflow module + demo job + run-status UI |
| `ai` | `AIModule` + app-owned Mastra Agent + `/conversation` |
| `notifications` | Experimental. Notification tables and `NotificationModule` (no extra UI paths) |
| `billing` | Records the feature id only. Does **not** scaffold `BillingModule` |
| `tags` / `connect` / `webhook` / `recurrence` | Experimental stubs. Prompt-only; empty template paths |

`create-m5kdev` **never** adds Optional Backend Module packages
(`@m5kdev/module-clay`, `docx`, `pdf`, `social`, `video`). Pin those by hand
on the Managed catalog. See
[Core vs Optional](/guides/v0.34.0-core-optional-backend-modules-migration).

### init / doctor / update

Managed state lives in `.m5kdev.json` (template version, features, catalog
snapshot, file policies). Bootstrap:
[Managed consumer updates](/guides/v0.31.0-managed-consumer-updates-migration).

- `init` writes that file at the running CLI version. It does not replay older
  migrations.
- `doctor` is static diagnostics. `--full` also runs `check-types`, `lint`, and
  `build` when those scripts exist. Optional `@m5kdev/module-*` pins must
  lockstep with the Kernel (`CATALOG_VERSION_MISMATCH`).
- `update --dry-run` plans without writes. Write mode needs a clean Git tree
  and applies only conflict-free plans.

`update` **ignores** `**/fly.toml` and `**/.env.production`. Copy those once
from a fresh scaffold if you want Fly. See
[Docker, Fly.io, and Node 24](/guides/v0.34.0-fly-deploy-migration).

The production migration registry is empty for 0.34.0. Structural upgrades in
this release are documented as Manual / Conditional steps in the guides below.

## 0.34.0 upgrades

Run these on existing apps, in this order when they apply:

1. [Catalog lockstep](/guides/v0.33.0-catalog-lockstep-migration) if still on nested Kernel drizzle
2. [Kernel Database commands](/guides/v0.34.0-kernel-database-commands-migration)
3. [Core vs Optional Backend Modules](/guides/v0.34.0-core-optional-backend-modules-migration)
4. [Docker, Fly.io, and Node 24](/guides/v0.34.0-fly-deploy-migration)
5. [App-owned Mastra agents and Conversation](/guides/v0.34.0-mastra-app-owned-agents-migration)
6. [Billing trial-ending email](/guides/v0.34.0-billing-trial-ending-email-migration)

Operational Fly runbook: [Deploy with Docker and Fly.io](/guides/fly-deploy).

## Package rule

Keep scaffolding and managed updates in this package. Product modules, grants,
and UI live in the generated app and in `@m5kdev/*`.
