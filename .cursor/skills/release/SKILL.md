---
name: release
description: Publish one Release for every publishable package after the maintainer names the bump and confirms.
disable-model-invocation: true
---

Publish one Release. A Release is one Semver version shared by every publishable `@m5kdev/*` package and `create-m5kdev`. The maintainer names `major`, `minor`, or `patch`. Do not infer the bump from the notes. From the current 0.x Release, patch increments the patch number, minor increments the minor number, and major produces 1.0.0.

If this message does not name a bump, ask for one and stop.

## Judge

From the repository root:

```
pnpm --filter m5kdev-release-tool judge -- --bump <major|minor|patch>
```

Read the JSON.

- `needs-bump`: ask for the bump and stop.
- `refused`: show the reason and stop. Do not write a Changeset, commit, publish, or push.
- `ready`: show the next version and the notes. If this message does not also confirm that preview, stop and wait.

Canceling leaves versions, changelogs, and the registry untouched.

## After confirmation

Run these from the repository root, and stop at the first failure. A failed build does not publish or push. A failed publish does not push.

1. `pnpm --filter m5kdev-release-tool write-changeset -- --bump <bump>`
2. `pnpm cs:version`
3. `pnpm --filter m5kdev-release-tool clear-unreleased`
4. Commit only the Release. Stage version files, changelogs, the consumed Changeset, and `pnpm-lock.yaml` when versioning changed it. Do not stage feature files.
5. `pnpm build`
6. `pnpm dlx @changesets/cli publish`
7. Push the commit, then push the tags.

Changesets writes the version section. Do not hand-copy the notes into that section, and do not edit the dependency lines Changesets adds. `clear-unreleased` removes the Unreleased heading so each note appears once.

If the registry asks for authentication this command cannot complete, stop and say so.
