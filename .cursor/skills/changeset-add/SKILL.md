---
name: changeset-add
description: Write one pending Changeset. Default scope is this thread and bump is patch; name a git range and/or minor or major to override.
disable-model-invocation: true
---

Write one pending Changeset for release-worthy behavior in the named scope. The human later runs `changeset version`; that command combines every pending Changeset into one release and takes the highest bump.

The bump is `patch` unless this invocation names `minor` or `major`. The scope is this thread unless this invocation names another one (since the last commit, since a SHA or tag, uncommitted files). Both can appear together. Write `.changeset/<id>.md` and stop. Leave CHANGELOG.md to version. Leave the file uncommitted.

## Decide

Read the files that scope changed.

- This thread: files the agent changed and edits the user clearly made as part of this thread. Ignore earlier commits on the branch and dirty files that predate the thread.
- A named git range: the diff of that range.

A change is release-worthy when a consumer of a versioned package would notice it. Write one sentence per distinct consumer-facing behavior.

Stop and say so when the scope changed no files, landed nothing a consumer would notice, or only touched packages Changesets ignores (see `.changeset/config.json`).

Read every pending file in `.changeset/` except `README.md` and `config.json`.

- A sentence that describes the same behavior as an existing Changeset is not new. Drop it and name that file. If every sentence is already recorded, stop.
- A behavior the scope reverted: delete the matching pending Changeset when the match is clear. When the match is uncertain, leave the file and say so.

## Write

Name each versioned package the scope changed. Pick a unique filename of three lowercase words joined by hyphens that does not already exist in `.changeset/`.

Write a file in that folder in this shape:

```
---
"package-name": patch
---

Improved authentication error handling.
```

Use the bump from this invocation on every named package. Several packages are extra frontmatter lines. The body is the sentence or sentences.

Confirm the file exists and that its bump, packages, and summary match the invocation and the scope. That is the record.
