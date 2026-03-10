# m5

Monorepo with shared backend, frontend, and UI packages. Built with [pnpm](https://pnpm.io), [Turborepo](https://turbo.build/repo), and [TypeScript](https://www.typescriptlang.org/).

## What's inside

### Packages

- **`packages/backend`** (`@m5kdev/backend`) – Composable Express server stack with Drizzle ORM, tRPC, and feature modules (auth, billing, file, AI, etc.).
- **`packages/frontend`** (`@m5kdev/frontend`) – Shared React hooks, utilities, and frontend logic (tRPC, auth, billing, table).
- **`packages/web-ui`** (`@m5kdev/web-ui`) – Shared UI component library (HeroUI, Radix, Tailwind).
- **`packages/commons`** (`@m5kdev/commons`) – Shared types, schemas, and utilities used by backend and frontend.
- **`packages/config`** (`@m5kdev/config`) – Shared configuration (e.g. TypeScript, tooling).
- **`packages/email`** (`@m5kdev/email`) – Email templates and build tooling (e.g. React Email).

### Apps

The workspace includes `apps/**` so you can add deployable applications (e.g. `apps/myapp/webapp`, `apps/myapp/server`) that depend on these packages. The `apps/` directory may be empty until you create your first app.

## Getting started

**Requirements:** Node.js >= 22, [pnpm](https://pnpm.io/installation).

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

## Modular structure

Feature areas live under `src/modules/<feature>/` with consistent file conventions:

- **`.constants.ts`** – Configuration and constants.
- **`.schema.ts`** – Validation (e.g. Zod) and types.
- **`.db.ts`** – Database schema and queries (Drizzle).
- **`.repository.ts`** – Data access layer.
- **`.service.ts`** – Business logic and orchestration.
- **`.trpc.ts`** / **`.router.ts`** – tRPC procedures and HTTP routes.

UI modules add:

- **`components/`** – React components.
- **`hooks/`** – React hooks.

See [AGENTS.md](AGENTS.md) for full layer boundaries and conventions.

## License

[GPL-3.0-only](LICENSE).
