# Kernel owns Database commands without the HTTP shell

Database command implementations (reset, sync, seed runner, script client, guard) were copied into every consumer from Starter and went stale on Kernel changes. Those commands now live in the Kernel as `runDb`, invoked from an app-owned Database config that supplies App schema and optional seed; they must not boot `createBackendApp` (HTTP, Redis, queues). drizzle-kit generate/migrate/studio and migration SQL stay in the app — they are the app’s schema history, not Kernel behavior.

**Considered options:** Keep ops in Starter Template files (status quo). Put `m5kdev db` in the CLI package instead of the Kernel. App-side argv switchboard. Boot `createBackendApp` in scripts so seed can use Services.

**Consequences:** Consumers get ops fixes by bumping `@m5kdev/backend`. Auth-shaped seed stays raw app inserts, so Kernel table changes can still break seed. Named `drizzle:*` scripts remain Template-managed. Database config is `ensure`d: first update adds it; customized seed three-way-merges if the sample also changes.
