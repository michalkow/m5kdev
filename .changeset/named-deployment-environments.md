---
"@m5kdev/backend": minor
"create-m5kdev": minor
---

Require `APP_ENV` and `APP_SLUG` at Kernel boot and isolate Workflow queues, Workflow rows, and Server event channels by Deployment environment so Development, Staging, Canary, and Production can share Redis without mixing work.
Turn Workflow schedulers off in Canary, which shares the Production database, and expose `/healthz` on the HTTP shell.
Take an advisory lock and timeouts in the `migrate` Database command, add `rebuild` for disposable databases, and ship `m5kdev-migration-check` so CI can freeze migration history.
Scaffold Development and Production always, with optional Staging and Canary, per-environment Fly configs, GitHub migrate-then-deploy workflows, Promotion PRs, and agent instructions that allow local or Development migrations only.
Let `create-m5kdev update --environments` add Staging or Canary to an existing app and rewrite a single Fly config into per-environment files.
