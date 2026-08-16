---
sidebar_position: 7
---

# CLI package

`create-m5kdev` scaffolds new apps from the `minimal-app` template and, after
enrollment, diagnoses and updates them. Invoke an **exact release** with
`pnpm dlx`. Do not add `create-m5kdev` to a generated app's dependencies.

```sh
pnpm dlx create-m5kdev@<version> --help
```

The published binary is also named `m5kdev`. Commands that operate on an
existing repo (`init`, `doctor`, `update`) use the current working directory and
reject a positional path.

## Commands

| Command | Purpose |
| --- | --- |
| `create` (default) | Scaffold a new app and write `.m5kdev.json`. |
| `init` | Enroll an existing compatible repo at the running CLI version. |
| `doctor` | Diagnose managed state, catalog, files, and pending migrations. |
| `update` | Reconcile the repo to the running CLI's template. |

A bare `pnpm dlx create-m5kdev@<version> [directory]` is treated as `create`.

## Create

```sh
pnpm dlx create-m5kdev@<version> my-app \
  --name "My App" \
  --description "…" \
  --platform web \
  --yes
```

| Flag | Effect |
| --- | --- |
| `--name` / `--description` | App name and description used in templates. |
| `--platform` | `web` (default), `expo`, or `both`. Enables `webapp` and/or `expo`. |
| `--with-test-harness` | Include the e2e app (`test-harness` feature). |
| `--yes` | Accept defaults for missing prompts. Required in non-TTY shells unless all values are passed. |
| `--force` | Allow a non-empty target directory. |
| `--skip-install` / `--skip-git` | Skip `pnpm install` or `git init`. |

After copy, the CLI writes `.m5kdev.json` and prints:

```sh
cd <directory>
pnpm --filter ./apps/server drizzle:migrate
pnpm dev
```

If copy fails and the CLI created the directory, it removes it.

## Managed state (`.m5kdev.json`)

Commit this file. It is schema version `1` and stores:

- Template name (`minimal-app`), version, enabled features, and non-secret
  rendering context (`appName`, `appDescription`, `appSlug`, `packageScope`).
- A snapshot of the managed `pnpm-workspace.yaml` catalog.
- Per-file policy (`merge` / `ensure` / `ignore`) and content hashes.
- Applied migration IDs.

It does **not** store `BETTER_AUTH_SECRET` or other secrets. Real `.env` files
and Drizzle SQL history are ignored by reconciliation.

## Init

Use this for apps that were not created by `create-m5kdev@0.31.0+`, after they
already match the target framework and starter. See
[Managed consumer updates in 0.31.0](/guides/v0.31.0-managed-consumer-updates-migration).

```sh
pnpm dlx create-m5kdev@<version> init [--yes] [--force] [--json]
```

- Infers slug, name, package scope, and features from the repo (`apps/webapp`,
  `apps/expo`, `apps/e2e`).
- Runs the same diagnostics as `doctor` against the **proposed** state.
- Writes `.m5kdev.json` only when there are no error diagnostics.
- Refuses an existing state file unless `--force` (re-baseline; does not repair
  app files).
- Non-interactive shells must pass `--yes`.

`init` does not apply older migrations. It records the running CLI version as
the baseline.

## Doctor

```sh
pnpm dlx create-m5kdev@<version> doctor [--full] [--json]
```

Exit code `1` when any diagnostic is `error`. Warnings and info (`ok: true`)
still succeed.

Static checks include: invalid/missing `.m5kdev.json`, CLI older or newer than
state, unknown/duplicate features, missing required paths, catalog drift or
missing `catalog:` entries, unresolved `{{APP_*}}` tokens, merge-conflict
markers, managed symlinks, and pending migrations.

`--full` also runs root `check-types`, `lint`, and `build` scripts when present
(10 minute timeout each).

`--json` emits `{ ok, diagnostics: [{ code, severity, message, path?, suggestion?, migrationId?, guide? }] }`.

Common follow-ups:

| Diagnostic | What to do |
| --- | --- |
| `UPDATE_AVAILABLE` | Preview with `update --dry-run` using the newer exact version. |
| `CLI_TOO_OLD` | Re-run doctor with `create-m5kdev@` the state's version (or newer). |
| `CATALOG_VERSION_MISMATCH` | Restore the managed catalog value, or treat a local pin as a conflict at update time. |
| `MIGRATION_PENDING` | Run `update` for that CLI version; the diagnostic includes `guide`. |
| `TEMPLATE_CUSTOMIZED` | Informational. Local edits to merge-managed files are expected. |

## Update

```sh
pnpm dlx create-m5kdev@<version> update [--dry-run] [--skip-install] [--json]
```

The running CLI version is the **target**. State newer than the CLI is refused.

1. Three-way merge of managed files (base = previous template from npm,
   local = your tree, target = this CLI's template).
2. Catalog merge: update unchanged managed versions, keep app-owned entries,
   conflict on customized managed values.
3. Plan pending registry migrations (`packages/cli/src/migrations/registry.ts`).
   The production registry is empty unless a release ships a transform.
4. Advance `.m5kdev.json`.

Write mode requires a clean Git worktree. `--dry-run` and `doctor` do not.
Any conflict means **zero writes**. After a clean apply, dependency changes run
`pnpm install` unless `--skip-install`.

File policies (from `template.manifest.json`):

| Policy | Behavior |
| --- | --- |
| `merge` | Three-way text merge; conflict if it cannot be applied cleanly. |
| `ensure` | Recreate a missing path; do not overwrite a customized file. |
| `ignore` | Never reconciled (`.env`, Drizzle SQL, and similar). |

Disabled features' template paths are excluded from baselines and updates.

## Constraints

- Always pin `@<version>`. Mixing a repo at template `0.32.8` with an older CLI
  fails; a newer CLI reports `UPDATE_AVAILABLE` until you update.
- Do not put secrets in `.m5kdev.json`.
- Do not create Drizzle migration files by hand; generate them in the app after
  schema changes.
- Historical `create-m5kdev@<from>` tarballs must be fetchable from npm when a
  customized text file needs its merge base.

## Related docs

- [Managed consumer updates in 0.31.0](/guides/v0.31.0-managed-consumer-updates-migration) — enrollment for pre-0.31 apps.
- [Getting started](/guides/getting-started) — docs site local commands.
- [Backend package](/packages/backend)
