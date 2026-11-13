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
pnpm dlx create-m5kdev@0.45.1 [directory] [create options]
pnpm dlx create-m5kdev@0.45.1 init [--yes] [--force] [--json]
pnpm dlx create-m5kdev@0.45.1 doctor [--full] [--json]
pnpm dlx create-m5kdev@0.45.1 update [--dry-run] [--skip-install] [--json] [--platform web|expo|both] [--yes]
```

A first positional argument that is not a command is treated as `create`.

### create

| Flag | Effect |
| --- | --- |
| `--name` / `--description` | App name and description |
| `--platform` | `web` (default), `expo`, `both`, or `landing` |
| `--with-test-harness` | Include the e2e harness (not valid with `--platform landing`) |
| `--yes` | Accept defaults for missing prompts |
| `--force` | Allow a non-empty directory |
| `--skip-install` / `--skip-git` | Skip `pnpm install` / `git init` |

`--platform landing` includes Landing and public product help: no Kernel (server, Email), no Webapp, no
Expo, and no Deploy home. Env lives in `apps/landing`. That shape has no
Waitlist. `--yes` without `--platform` stays `web`. `--with-test-harness` with
landing is refused. Decision record: `docs/adr/0025-landing-only-create-has-no-kernel.md`.

`--yes` is web + always-on only: no test harness and **no** optional Backend
Modules. There is no `--modules` flag. Interactive create prompts
comma-separated module ids (or `none`). Experimental choices are labeled in
that prompt. Landing-only create skips those prompts.

Create writes root `GLOSSARY.md` (kernel tenancy and access language;
optional-module nouns are feature-gated), `docs/agents/` (GitHub issue tracker,
domain docs, triage labels), and `docs/adr/`. Landing-only keeps `docs/agents`
and the Product documentation term without server-domain language. `m5kdev update` **ensures** those paths if they
are missing and does not overwrite local glossary edits.

Always-on for `web` / `expo` / `both` in Starter: Auth, Email, Posts, Email
preview, Landing, product help, Deploy home. Kernel infrastructure is not a selectable
module. Expo-only still includes a server.

| Id | What selecting it does |
| --- | --- |
| `files` | File module + web Files UI |
| `workflows` | Workflow module + demo job + run-status UI |
| `ai` | `AIModule` + app-owned Mastra Agent + `/conversation` |
| `notifications` | Experimental. Notification tables, `NotificationModule`, Shared kinds, web inbox/preferences UI, Expo `/notifications` |
| `mcp` | `McpModule` + MCP allowlist and Better Auth OAuth tables + Starter Posts `meta.mcp` on `list-posts` / `create-post`. **Default off.** Starter still registers McpModule. |
| `billing` | Records the feature id only. Does **not** scaffold `BillingModule` |
| `tags` / `connect` / `webhook` / `recurrence` | Experimental stubs. Prompt-only; empty template paths |

`create-m5kdev` **never** adds Optional Backend Module packages
(`@m5kdev/module-clay`, `docx`, `pdf`, `social`, `video`). Pin those by hand
on the Managed catalog. See
[Core vs Optional](/guides/v0.34.0-core-optional-backend-modules-migration).

### Agent instructions

Every platform receives a root `AGENTS.md`, with additional server/webapp
instructions when applicable. The scaffold assumes the required rule skills
from [michalkow/skills](https://github.com/michalkow/skills) are installed
globally; it installs no local skill copies and ships no `CLAUDE.md` or Cursor
rules. The existing GitHub Issues, triage-label, glossary, and ADR setup is
included so the engineering skills have repository context.

When root `PROJECT.md` exists, agents read it as the App's **North Star**:
why the project exists, its intended function and experience, and its priorities.
It is purpose context rather than an architecture plan. Agents should flag a
conflict before editing—for example, added response latency in a narrative
game whose goals are fast, fun gameplay. The CLI does not create this file;
when it is absent, agents continue with the task's stated goals.

Instructions point agents to an accessible local m5kdev checkout or the
[upstream repository](https://github.com/michalkow/m5kdev), matching the App's
installed version. The maintainer's local checkout is an optional example,
not a required path. When a task needs an upstream fix and access permits,
agents can submit a PR there under that repository's own instructions.

Production deployment requires explicit user instruction for every platform.
For server-backed Apps, Production database migration requires that instruction
as well; feature work or a PR request is not authorization. This
includes Canary operations that change the Production database. Production
migrations still run through the deploy workflow. Agents may generate and apply
migrations to local or Development databases without additional confirmation.
Migration integrity and disposable-reset rules remain in the generated
`docs/agents/database-migrations.md`; the framework repository retains its own
operational conventions and Cursor rules.

### Changesets

Every generated app, including Landing-only, includes `@changesets/cli` as a root
`devDependency` pinned through the Managed catalog. Normal creation installs it;
with `--skip-install`, run `pnpm install` before using it. The generated
`.changeset/config.json` uses `main` as its base branch and enables versioning
and changelogs for private workspace packages.

```sh
pnpm cs:add
# Select affected packages, a bump, and a summary; commit .changeset/*.md with the code.
pnpm cs:version
pnpm install
# Review and commit versions, changelogs, lockfile, and removed changeset files.
```

Both scripts use the installed CLI. Packages remain private, with no automatic
commits or tags. The generated README and `.changeset/README.md` describe the
workflow. Changesets configuration can be customized for the app's release policy.

### Public product help

Every generated app includes a Docusaurus site in `apps/docs`, including
Landing-only and Expo-only apps. This is end-user product help; the framework
site you are reading remains developer documentation. Initial guides follow
the selected platforms and optional features.

Run `pnpm docs:dev` (port 3001), `pnpm docs:build`, or `pnpm docs:serve`.
Development serves one locale at the root URL; Help links use that root. Use
`pnpm docs:dev -- --locale en-GB` to edit another locale, and build/serve to
preview language switching across the full site.
Help supports every locale in `apps/locales.ts`, including regional variants.
Guides, navigation, and the language menu follow that shared configuration.
The full build rejects missing guide translations.

Installation asks where to host help. Use `--docs-host landing` (the default),
`--docs-host server`, or `--docs-host standalone` for noninteractive installation.
Landing bundles help at `/documentation` in the Landing image and deployment.
Server mode bundles it with the product in every Deployment environment;
`createBackendApp` explicitly serves it before the Webapp fallback. Server mode
also works for Expo-only products and is unavailable for Landing-only apps.

Standalone mode retains a Caddy Docker image and independent `deploy-docs.yml`
workflow using `FLY_API_TOKEN_DOCS` and `DOCS_ENV_PRODUCTION`, or the static output
can be copied to an independently managed web server. Bundled modes need no
separate documentation deployment or docs-specific Fly credentials.

Set `VITE_DOCS_URL` to the absolute public help URL, including its path, in both
docs and client builds for a custom domain. Expo uses `EXPO_PUBLIC_DOCS_URL`.
Keep `/documentation/` for bundled hosting; standalone builds can use `/` or a
custom subpath. The standalone Docker image bakes matching Caddy routes during
the build, so no runtime variable is required for the mount path. Help links use
the selected host and current locale when known.

Generated `AGENTS.md` instructions require agents to update affected guides
and translations in every configured locale before completing user-facing work.
Frontend help follows screens and user journeys: how to reach and interact with
each screen, its controls, expected outcomes, and navigation. Apps that expose a
backend API or MCP interface document consumer usage in separate sections from
screen walkthroughs and from each other, including authentication, permissions,
operations/tools, inputs/outputs, examples, limits, and errors. Implementation
internals and operations instructions remain outside the public help site.
Detailed rules live in `docs/agents/product-documentation.md`. Framework updates
preserve app-written guides and translations. The hosting selection persists;
legacy apps without a selection retain standalone hosting. When upgrading an
existing app, move any custom locale configuration into `apps/locales.ts` and
provide guides for all configured locales before building.

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
- `update --platform web|expo|both` is the landing-only escape hatch onto the
  always-on product stack for that platform. It keeps existing Landing sources,
  copies Landing env into Deploy home, then asks optional Backend Modules and
  e2e the same way create does. `--yes` skips those extras (no harness, no
  optional modules) and does not skip the clean Git check. The flag is refused
  on repos that already have a Webapp or Expo, and `--platform landing` cannot
  downgrade.

Agent-guidance updates remove unchanged managed `CLAUDE.md` and Cursor-rule
files and install the current AGENTS guidance. If an obsolete file was
customized, `update` reports a conflict and writes nothing. Move useful
App-specific guidance into `AGENTS.md`, remove the obsolete file, commit those
changes, and rerun the update. Existing AGENTS customizations use the normal
three-way merge; conflicts require review rather than overwriting local guidance.
Install the required global skills before adopting this setup. App-owned
`PROJECT.md` is preserved; the updater does not create or replace its goals.

`update` **ignores** `**/fly.toml` and `**/.env.production`. Copy those once
from a fresh scaffold if you want Fly. See
[Docker, Fly.io, and Node 24](/guides/v0.34.0-fly-deploy-migration).
Root deploy scripts call Kernel bins; see
[Kernel Fly deploy commands](/guides/v0.35.0-kernel-fly-commands-migration).

The production migration registry is empty for 0.34.0, 0.35.0, 0.36.0, 0.37.0,
and 0.38.0. Structural upgrades are documented as Manual / Conditional steps in the
guides below.

## 0.34.0 upgrades

Run these on existing apps, in this order when they apply:

1. [Catalog lockstep](/guides/v0.33.0-catalog-lockstep-migration) if still on nested Kernel drizzle
2. [Kernel Database commands](/guides/v0.34.0-kernel-database-commands-migration)
3. [Core vs Optional Backend Modules](/guides/v0.34.0-core-optional-backend-modules-migration)
4. [Docker, Fly.io, and Node 24](/guides/v0.34.0-fly-deploy-migration)
5. [App-owned Mastra agents and Conversation](/guides/v0.34.0-mastra-app-owned-agents-migration)
6. [Billing trial-ending email](/guides/v0.34.0-billing-trial-ending-email-migration)

## 0.35.0 upgrades

1. [Kernel Fly deploy commands](/guides/v0.35.0-kernel-fly-commands-migration)
2. [Kernel Server events](/guides/v0.35.0-kernel-server-events-migration)

## 0.36.0 upgrades

Run these on existing apps, in this order when they apply. Auth schema
guides (1–3) can share one Drizzle generate after the catalog bump.

1. [Membership at invite](/guides/v0.36.0-membership-at-invite-migration)
2. [Account claim and Waitlist](/guides/v0.36.0-account-claim-waitlist-migration)
3. [Team drop and unused User payment columns](/guides/v0.36.0-team-drop-migration)
4. [Email preview gate](/guides/v0.36.0-email-preview-gate-migration)
5. [Notification inbox](/guides/v0.36.0-notification-inbox-migration)

## 0.37.0 upgrades

Run these on existing apps, in this order when they apply. Better Auth `issuer`
and Inbound callback `name` / `secret` can share one Drizzle generate after the
catalog bump. McpModule is opt-in; complete Better Auth 1.7.2 first if you enable
it.

1. [Better Auth 1.7.2](/guides/v0.37.0-better-auth-1.7.2-migration)
2. [McpModule and MCP OAuth](/guides/v0.37.0-mcp-oauth-migration)
3. [Inbound callback secrets](/guides/v0.37.0-inbound-callback-secrets-migration)

## 0.38.0 upgrades

1. [Organization Stripe paywall and opt-in Seat billing](/guides/v0.38.0-billing-org-paywall-migration)

Root `.dockerignore` now ignores SQLite `*.db` / wal / shm files (see the Fly
runbook). There is no registry `id` for these upgrades.

Operational Fly runbook: [Deploy with Docker and Fly.io](/guides/fly-deploy).

## 0.45.0 upgrades

1. [PostHog error tracking](/guides/v0.45.0-posthog-error-tracking-migration)
2. Public product help is additive. `update` can add the `apps/docs` scaffold;
   existing apps keep working without it. See
   [Public product help](/packages/cli#public-product-help).

## 0.45.1 upgrades

Localized product help and configurable hosting. Existing apps keep working
without source, schema, catalog, env, or bootstrap changes. New apps default to
Landing hosting; `update` preserves the current host and translated guides.
Legacy apps without a selection stay on standalone hosting. See
[Public product help](/packages/cli#public-product-help).

## Package rule

Keep scaffolding and managed updates in this package. Product modules, grants,
and UI live in the generated app and in `@m5kdev/*`.
