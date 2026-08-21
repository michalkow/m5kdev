---
sidebar_position: 1
---

# Packages

Package docs explain ownership and imports. Detailed usage belongs in
[module docs](/modules) when a feature spans multiple packages.

| Package | Role |
| --- | --- |
| [Backend](./backend) | Kernel infrastructure, Core Modules, and `createBackendApp`. Optional Backend Modules are `@m5kdev/module-*`. |
| [Frontend](./frontend) | Shared React hooks and frontend logic. |
| [Web UI](./web-ui) | Shared HeroUI/Tailwind component library. |
| [Commons](./commons) | Shared schemas, constants, and utilities. |
| [Email](./email) | Shared React Email chrome and template types (not `EmailModule`). |
| [CLI](./cli) | Project creation, `init` / `doctor` / `update`, and 0.34.0 upgrade entry. |
| [Config](./config) | Shared workspace configuration package. |

## 0.34.0 upgrades

- [Kernel Database commands](/guides/v0.34.0-kernel-database-commands-migration)
- [Core vs Optional Backend Modules](/guides/v0.34.0-core-optional-backend-modules-migration)
- [Docker, Fly.io, and Node 24](/guides/v0.34.0-fly-deploy-migration)
- [App-owned Mastra agents and Conversation](/guides/v0.34.0-mastra-app-owned-agents-migration)
- [Billing trial-ending email](/guides/v0.34.0-billing-trial-ending-email-migration)
- [CLI package](./cli)
