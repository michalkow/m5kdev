---
"@m5kdev/backend": minor
"create-m5kdev": minor
---

Kernel owns Fly deploy and secrets wrappers (`m5kdev-fly-deploy` / `m5kdev-fly-secrets`). Starter drops copied `fly-*.mjs` scripts; root `app:deploy` / `landing:*` call the bins via a root `@m5kdev/backend` devDependency.
