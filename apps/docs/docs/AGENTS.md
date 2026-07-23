# Migration guide authoring instructions

## Scope

These instructions apply when creating or updating migration documentation under
`apps/docs/docs/guides/`.

Migration guides are release artifacts. They must let maintainers of an existing
application upgrade without comparing the whole framework or starter by hand.
Do not produce a guide from memory or from a prose summary alone. Inspect the
actual framework, dependency catalog, starter, root templates, and release diff.

## File naming and versioning

- Create each new guide at
  `apps/docs/docs/guides/v<target-version>-<migration-slug>-migration.md`.
- Use the first released version that requires the migration as
  `<target-version>`, without a leading `v` in metadata and with a leading `v`
  in the filename. Example:
  `v0.31.0-auth-session-metadata-migration.md`.
- Use lowercase kebab-case for `<migration-slug>`.
- Do not use `latest`, `next`, a date, a branch name, or an unreleased package
  version. If the target release version is unknown, ask the maintainer for it
  before creating the guide.
- One guide should cover one cohesive migration. When a single framework change
  spans several `@m5kdev/*` packages, keep it in one guide and list every
  affected package.
- Do not rename existing unversioned guides merely to conform to this rule;
  preserve their published URLs unless the maintainer explicitly requests a
  redirect-backed rename.

## Required front matter

Start every new migration guide with this metadata:

```yaml
---
title: <Human-readable migration title>
description: <One-sentence description of who must migrate and why>
migration:
  id: <target-version>-<migration-slug>
  target_version: <target-version>
  applies_from: <SemVer range or explicit versions>
  breaking: <true-or-false>
  packages:
    - <affected package name>
---
```

`applies_from` identifies versions that need the guide; it is not the new
version. Quote ranges that contain YAML operators, for example
`">=0.28.0 <0.31.0"`.

Add `sidebar_position` only when the intended position is known. Do not invent a
position that duplicates another guide.

## Required investigation

Before writing, establish the release base and inspect all relevant changes.
For starter changes, prefer the previous `create-m5kdev` release tag as the base:

```bash
git diff create-m5kdev@<previous-version>..HEAD -- \
  apps/starter \
  packages/cli/root-templates \
  packages/cli/scripts/prepare-templates.ts \
  packages/cli/templates/minimal-app
```

Also inspect:

1. Changed `@m5kdev/*` package source, exports, peer dependencies, and package
   versions.
2. The root `pnpm-workspace.yaml` catalog and the generated-app catalog at
   `packages/cli/root-templates/pnpm-workspace.yaml.tpl`.
3. Added, modified, moved, and deleted files in `apps/starter` and
   `packages/cli/root-templates`.
4. Feature-conditional template paths and `// m5k:<feature>:start/end` blocks.
5. Database schema changes, data backfills, environment variables, roles,
   grants, providers, routers, jobs, and application bootstrap wiring.
6. Tests and working starter usage that demonstrate the new API.
7. Existing migration guides that overlap or must be completed first.

Do not assume that generated templates are synchronized merely because the
starter compiles. Root templates and dependency catalogs are layered separately
and must be checked explicitly.

## Required guide structure

Use the following sections. A section may state "None" with a brief explanation,
but it must not be silently omitted when relevant to upgrade safety.

1. `# <Title>`
2. `## Summary`
3. `## Who needs this migration`
4. `## Prerequisites and upgrade order`
5. `## What changed`
6. `## Dependency and catalog changes`
7. `## Starter and template file changes`
8. `## Migration steps`
9. `## Database migration`
10. `## Environment and deployment changes`
11. `## Verification`
12. `## Rollback`
13. `## Troubleshooting`
14. `## Complete upgrade checklist`

## Content requirements

### Migration registry and automation

- Every guide that has an automatic source or configuration change must name
  the matching entry in `packages/cli/src/migrations/registry.ts`. The guide's
  `migration.id`, the registry `id`, target version, description, and guide path
  must agree exactly.
- Keep the production registry empty when a release needs no semantic
  transform. Never invent a no-op migration merely to attach a guide.
- Put structural TypeScript and TSX changes in embedded, in-memory transforms
  under `packages/cli/src/migrations/`; do not require Codemod.com or add an
  updater dependency to generated applications.
- Every transform must have TS and/or TSX fixtures appropriate to its scope and
  must be run twice in tests to prove idempotency.
- Add reconciliation or command fixtures for non-AST automation. Tests must
  cover the automatic result, the conflicting local-edit case, and validator
  diagnostics.
- In the guide, label each step `Automatic`, `Manual`, or `Conditional` and say
  which `m5kdev update` phase performs it. Manual steps must remain explicit
  even when an LLM could plausibly perform them.

### Summary and applicability

- Explain the user-visible or architectural reason for the change.
- State which source versions, app types, and optional features are affected.
- State clearly when no action is required.
- Identify prerequisite migrations and the required order.

### Dependencies and catalogs

- List every added, removed, renamed, or version-changed direct dependency.
- Include framework packages and coupled third-party dependencies.
- Show exact `pnpm-workspace.yaml` catalog edits using versions tested by the
  target framework release. Do not recommend a blanket
  `pnpm update --latest`.
- Keep all `@m5kdev/*` packages on the intended compatible release unless the
  repository proves that mixed versions are supported.
- Mention changes to Node.js, pnpm, peer dependency, override, or lockfile
  requirements.
- Distinguish dependencies required by every app from dependencies required by
  only `webapp`, `expo`, `email`, `e2e`, or another optional feature.

### Starter and template files

- Include a table of every relevant added, modified, moved, or deleted starter
  and root-template path.
- For each path, state whether an existing app must add it, edit it, rename it,
  delete it, or only validate its structure.
- Describe the semantic change instead of instructing users to overwrite a
  customized file wholesale.
- Include complete content for genuinely new small files. For customized or
  large files, provide focused before/after snippets with enough surrounding
  context to apply safely.
- Cover configuration outside `apps/starter`, especially root files, CI,
  environment examples, agent rules, and package-manager configuration.

### Migration steps

- Order steps so the repository remains understandable and type errors are
  resolved progressively: catalog/package changes, shared contracts, server
  composition, frontend composition, templates/configuration, then cleanup.
- Use real exported names and paths verified in the target code.
- Mark each step as `Automatic`, `Manual`, or `Conditional` when automation
  support exists.
- Call out destructive or irreversible operations before the command that
  performs them.
- Never create a Drizzle migration file manually. Describe the schema change and
  instruct the maintainer to run the project's migration generation command.

### Verification and rollback

- Provide focused behavior checks for the migrated feature.
- Include the repository's relevant install, typecheck, lint, test, build, and
  starter smoke-test commands when they exist.
- State expected success behavior, not only the command to run.
- Include production concerns such as database rollout order, environment
  variables, background workers, telemetry, and backward compatibility.
- Explain which application changes can be reverted and which data/schema
  changes require a forward fix or backup restoration.

## Coverage rules

- A migration guide is incomplete if it covers a framework API change but omits
  the corresponding starter, catalog, template, configuration, or deployment
  change.
- Do not write “upgrade the packages” without naming packages and target
  versions.
- Do not write “update the configuration” without naming fields, files, and
  expected values.
- Do not claim that no database migration, dependency change, or template change
  is required until the relevant diff has been inspected.
- Do not hide unresolved uncertainty. Add a clearly labeled `Open question` and
  ask the maintainer rather than inventing behavior.
- Link to related guides using stable documentation paths.
- Prefer copyable code and commands, but never include secrets or real
  credentials.

## Final self-review

Before considering the guide complete, verify that:

- The filename, `migration.id`, and `target_version` agree.
- Any automatic migration has a matching registry entry and idempotent fixture
  coverage; a guide-only release leaves the production registry empty.
- The applicability range is explicit.
- All affected packages and exact compatible versions are listed.
- The root catalog and generated-app catalog were both checked.
- Every relevant starter/root-template path appears in the file-change table.
- Database, environment, deployment, rollback, and feature-conditional impacts
  are addressed.
- Code samples match current exports and the repository's strict layer and
  composition conventions.
- The complete checklist reproduces every required action from the body.
- Documentation links resolve and the docs build succeeds.

If any item cannot be verified, report it explicitly instead of marking the
migration complete.
