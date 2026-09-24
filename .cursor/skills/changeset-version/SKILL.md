---
name: changeset-version
description: Version pending Changesets, update docs, build, publish, and push tags. Stop at the first failure.
disable-model-invocation: true
---

Turn every pending Changeset into one published release.

Stop at the first failed step. Do not retry. Report the failure and leave later steps undone.

## 1. Read pending Changesets

Read every `.changeset/*.md` except `README.md`.

If none exist, stop and say so.

## 2. Docs and migration

From those Changesets, decide what `apps/docs` needs for the upcoming version. Infer that version from current package versions plus the highest bump in the pending files.

- Update existing docs when documented behavior is now wrong.
- Write a migration guide when an app on the current published version must change source, schema, catalog, env, or bootstrap to keep working. Follow `apps/docs/docs/AGENTS.md`.
- Do neither when the Changesets do not affect documented surfaces.

Apply those edits before versioning.

## 3. Version, build, publish, push

From the repository root, in order:

3. `pnpm dlx @changesets/cli version`
4. `pnpm build`
5. `pnpm dlx @changesets/cli publish`
6. `git push --follow-tags`

After version, commit only the Release (versioned package files, changelogs, consumed Changesets, `pnpm-lock.yaml` when it changed, and the docs edits from step 2) so the tags in step 6 point at the versioned tree. Do not stage unrelated files.

If the registry asks for authentication this command cannot complete, stop and say so. A failed build does not publish or push. A failed publish does not push.
