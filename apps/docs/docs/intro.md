---
slug: /
sidebar_position: 1
---

# m5kdev documentation

m5kdev is a TypeScript monorepo for composing backend services, shared contracts,
frontend hooks, and reusable web UI. The docs are organized around product modules
first, because a module usually spans more than one package.

## Read by module

Use the module docs when you are adding a feature to an app. A module page explains
the shared contract, backend wiring, frontend hooks, and UI pieces that belong
together.

- [File module](/modules/file) documents shared file types, backend upload routes,
  frontend upload/download hooks, and the full browser-to-S3 flow.
- [Auth module](/modules/auth), [billing module](/modules/billing), and
  [table module](/modules/table) are scaffolded with the same shape for follow-up
  documentation.

## Read by package

Use the package docs when you need to understand ownership, exports, and where code
should live.

- [Backend package](/packages/backend) owns server modules, repositories, services,
  tRPC fragments, Express hooks, jobs, and app-kernel composition.
- [Frontend package](/packages/frontend) owns shared React hooks and client-side
  module logic.
- [Web UI package](/packages/web-ui) owns reusable HeroUI/Tailwind components.
- [Commons package](/packages/commons) owns shared constants, schemas, and types.

## Local commands

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```
