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
| [CLI](./cli) | Project creation, `init` / `doctor` / `update`, and 0.34.0 / 0.35.0 / 0.36.0 / 0.37.0 upgrade entry. |
| [Config](./config) | Shared workspace configuration package. |

## 0.34.0 upgrades

- [Kernel Database commands](/guides/v0.34.0-kernel-database-commands-migration)
- [Core vs Optional Backend Modules](/guides/v0.34.0-core-optional-backend-modules-migration)
- [Docker, Fly.io, and Node 24](/guides/v0.34.0-fly-deploy-migration)
- [App-owned Mastra agents and Conversation](/guides/v0.34.0-mastra-app-owned-agents-migration)
- [Billing trial-ending email](/guides/v0.34.0-billing-trial-ending-email-migration)
- [CLI package](./cli)

## 0.35.0 upgrades

- [Kernel Fly deploy commands](/guides/v0.35.0-kernel-fly-commands-migration)
- [Kernel Server events](/guides/v0.35.0-kernel-server-events-migration)

## 0.36.0 upgrades

- [Membership at invite](/guides/v0.36.0-membership-at-invite-migration)
- [Account claim and Waitlist](/guides/v0.36.0-account-claim-waitlist-migration)
- [Team drop and unused User payment columns](/guides/v0.36.0-team-drop-migration)
- [Email preview gate](/guides/v0.36.0-email-preview-gate-migration)
- [Notification inbox](/guides/v0.36.0-notification-inbox-migration)

## 0.37.0 upgrades

- [Better Auth 1.7.2](/guides/v0.37.0-better-auth-1.7.2-migration)
- [McpModule and MCP OAuth](/guides/v0.37.0-mcp-oauth-migration)
- [Inbound callback secrets](/guides/v0.37.0-inbound-callback-secrets-migration)
