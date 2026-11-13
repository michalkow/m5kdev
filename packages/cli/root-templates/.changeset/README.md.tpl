# Changesets

Run `pnpm cs:add` from the workspace root to record a change. Select the affected
workspace packages, choose a patch, minor, or major bump, and write a short summary.
Commit the generated `.changeset/*.md` file with your code.

When preparing a release, run `pnpm cs:version`. This consumes pending changesets,
updates private package versions, and writes their `CHANGELOG.md` files. Run
`pnpm install` to refresh the lockfile, review the result, and commit the version,
changelog, lockfile, and changeset removal changes together.

Packages stay private. These commands do not publish, create Git tags, or commit
for you. Configuration lives in `.changeset/config.json`; see the
[Changesets documentation](https://github.com/changesets/changesets/tree/main/docs).
