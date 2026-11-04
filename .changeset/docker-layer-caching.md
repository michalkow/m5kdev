---
"@m5kdev/backend": patch
"create-m5kdev": patch
---

Pass a hash of public `VITE_*` values as `VITE_CONFIG_HASH` on Fly deploy so frontend image rebuilds follow configuration changes without invalidating dependency layers.

Ship layered Dockerfiles that install from workspace manifests with a persistent pnpm store cache, copy only the apps each image needs, and ignore nested secrets, build artifacts, and unused apps.

Serve landing as compiled static files with Caddy, and keep pnpm overrides in `pnpm-workspace.yaml` so root development tooling stays out of the image.
