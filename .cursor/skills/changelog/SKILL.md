---
name: changelog
description: Record behavior that landed in this thread under Unreleased on every Release package.
disable-model-invocation: true
---

Record behavior that landed in the current thread on the shared Unreleased list. A Release is one Semver version shared by every publishable `@m5kdev/*` package and `create-m5kdev`. Starter apps and the docs site are not part of a Release.

Do not commit. Do not edit a versioned changelog section. Do not invent notes when this thread changed no files.

## What to record

Read this thread and the files it changed. A landed behavior is something a package consumer can understand, written as one sentence. Include files the agent changed and edits the user clearly made as part of this thread. Ignore earlier commits on the branch and dirty files that predate the thread.

If this thread changed no files, stop and say so. Do not call the tool.

Read the Unreleased bullets already on one Release changelog. They are the same on every Release package.

- A new sentence that describes the same behavior as an existing bullet is not new. Set `sameAs` to that bullet's exact text.
- A new sentence that is not already listed has `sameAs: null`.
- A behavior this thread reverted names the existing bullet in `matchesBullet`. Remove it only when the match is clear. When the match is uncertain, set `matchesBullet` to null and leave the bullet.

## Record

Write a JSON file:

```json
{
  "landed": [{ "behavior": "Owners cannot leave an Organization.", "sameAs": null }],
  "reverted": [{ "behavior": "Seat billing may have changed.", "matchesBullet": null }]
}
```

From the repository root:

```
pnpm --filter m5kdev-release-tool record -- --thread <path-to-json>
```

The tool copies the resulting bullets onto every Release package, including a package that has no changelog yet, and leaves packages outside the Release alone. Notes already written on any Release package stay on the shared list. If the JSON result lists `uncertainReverts`, tell the user which behaviors were left in place.
