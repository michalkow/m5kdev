# Migrations run in GitHub Actions before each deploy

Each Deployment environment's deploy workflow runs a migrate job (the `migrate` Database command) and then a deploy job that depends on it. Migrations never run from the image: not in the Dockerfile, not as a Fly `release_command`, and not at server startup. Canary's deploy migrates the Production database; Production's deploy then finds nothing pending, which also covers a release that skips Canary. Production's direct database URL exists only in the GitHub `production` environment, so there is no way to migrate Production from a laptop. Agents may migrate the local or Development database only.

## Considered Options

- **Fly `release_command`** — rejected: migrations and a migrate entry point would have to ship inside every image; the release machine is less visible than a workflow job; and the deploy would depend on how Fly release machines expose secrets.
- **Dockerfile step** — rejected: the build runs on Fly's remote builder, may not reach the database, and can run more than once per release.
- **Migrate at server startup** — rejected: every machine would race to migrate, and a failing migration would take the app down instead of stopping the deploy ([ADR-0005](0005-kernel-owns-database-commands.md) already rules out runtime auto-migrations).
- **Manual production migration job with its own approval** — rejected: the Promotion PR merge and GitHub environment protection are already the approval.
- **An environment guard inside `runDb`** — rejected: keeping the Production direct URL out of every local `.env` is the stronger guard, and the guard would need to detect CI reliably.

## Consequences

- The `migrate` Database command takes an advisory lock and sets lock and statement timeouts, so a `main` merge and an agent cannot migrate Development at once, and a blocked `ALTER TABLE` cannot stall Production traffic.
- Every migration must be backward-compatible with the code currently in Production, because Canary migrates while Production's previous code is still serving.
- A manual `fly deploy` skips migrations. That is accepted; the workflow is the supported path.
- The migrate job runs repository code with the target database's direct URL. Only pushes to protected branches trigger it, and the URL is exposed to the migrate step only.
