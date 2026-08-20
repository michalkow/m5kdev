# m5

Monorepo with shared backend, frontend, and UI packages. Built with [pnpm](https://pnpm.io), [Turborepo](https://turbo.build/repo), and [TypeScript](https://www.typescriptlang.org/).

## What's inside

### Packages

- **`packages/backend`** (`@m5kdev/backend`) – Kernel: infrastructure, Core Modules, Drizzle, Better Auth, tRPC, and `createBackendApp`.
- **`packages/module-*`** (`@m5kdev/module-clay`, `module-docx`, `module-pdf`, `module-social`, `module-video`) – Optional Backend Modules. Not part of the Kernel; apps that need them add a Managed-catalog pin.
- **`packages/frontend`** (`@m5kdev/frontend`) – Shared React hooks, utilities, and frontend logic (tRPC, auth, billing, table).
- **`packages/web-ui`** (`@m5kdev/web-ui`) – Shared UI component library (HeroUI, Radix, Tailwind).
- **`packages/commons`** (`@m5kdev/commons`) – Shared types, schemas, and utilities used by backend and frontend.
- **`packages/config`** (`@m5kdev/config`) – Shared configuration (e.g. TypeScript, tooling).
- **`packages/email`** (`@m5kdev/email`) – Email templates and build tooling (e.g. React Email).

### Apps

The workspace includes `apps/**` so you can add deployable applications (e.g. `apps/myapp/webapp`, `apps/myapp/server`) that depend on these packages. The `apps/` directory may be empty until you create your first app.

## Getting started

**Requirements:** Node.js >= 24, [pnpm](https://pnpm.io/installation).

```sh
pnpm install
```

### Build

Build all packages and apps:

```sh
pnpm build
```

Build a specific package:

```sh
pnpm exec turbo build --filter=@m5kdev/backend
pnpm exec turbo build --filter=@m5kdev/web-ui
```

### Develop

Run all dev tasks (defined per package/app):

```sh
pnpm dev
```

Run with a filter:

```sh
pnpm exec turbo dev --filter=@m5kdev/backend
```

### Lint and type-check

```sh
pnpm lint
pnpm lint:fix
pnpm check-types
```

## Using this repo

This repository is intended to be **cloned and used as a monorepo**. Add it as a workspace or clone it and build your apps under `apps/` that consume `@m5kdev/backend`, `@m5kdev/frontend`, and `@m5kdev/web-ui`. See [AGENTS.md](AGENTS.md) and package READMEs for architecture and conventions.

## Backend app kernel

`@m5kdev/backend` now ships a first-class backend composition root for Express apps:

- `createBackendApp(...)` owns backend wiring for DB, Drizzle, Redis, Better Auth, workflows, tRPC, Express JSON/CORS, HTTP listen, startup, and shutdown.
- `defineBackendModule(...)` is the backend module contract for tables, repositories, services, router fragments, Express hooks, and workflow hooks.
- App-specific backend types still live in the app. Export `AppRouter` from the built backend app and consume that from your client.

Minimal shape:

```ts
import { createBackendApp, type InferBackendAppRouter } from "@m5kdev/backend/app";
import { postsModule } from "./modules/posts/posts.module";

export const builtBackendApp = createBackendApp(
  {
    db: { url: process.env.DATABASE_URL! },
  },
  [postsModule]
);

export const appRouter = builtBackendApp.trpc.router;
export type AppRouter = typeof builtBackendApp.trpc.router;
```

First-party modules such as `auth`, `workflow`, `notification`, and `email` register the same way.

The Kernel creates Express and applies JSON and CORS. Pass `express` only when you need extra middleware on an instance that has **not** already applied json/CORS. Extra routes belong on a Backend Module `express` hook. See [Kernel Express HTTP shell](apps/docs/docs/guides/v0.33.0-kernel-express-http-shell-migration.md).

Shared app metadata such as public URLs and email transport should be treated as backend app-level infrastructure rather than module-local configuration.

## Migration

- Apps still using manual backend composition should follow [MIGRATING_APPS_TO_BACKEND_KERNEL.md](MIGRATING_APPS_TO_BACKEND_KERNEL.md).
- Apps that already use the backend but still expose request-bound service methods as plain async functions should also review [packages/backend/MIGRATING_TO_SERVICE_PROCEDURES.md](packages/backend/MIGRATING_TO_SERVICE_PROCEDURES.md).

## Modular structure

Feature areas live under `src/modules/<feature>/` with consistent file conventions:

- **`.constants.ts`** – Configuration and constants.
- **`.schema.ts`** – Validation (e.g. Zod) and types.
- **`.db.ts`** – Database schema and queries (Drizzle).
- **`.repository.ts`** – Data access layer.
- **`.service.ts`** – Business logic and orchestration.
- **`.trpc.ts`** / **`.router.ts`** – tRPC procedures and HTTP routes.

Backend app composition should now live in `apps/*/server/src/app.ts`. App modules should use `defineBackendModule(...)` instead of ad hoc import-time wiring in app roots.

UI modules add:

- **`components/`** – React components.
- **`hooks/`** – React hooks.

See [AGENTS.md](AGENTS.md) for full layer boundaries and conventions.

## License

[GPL-3.0-only](LICENSE).
