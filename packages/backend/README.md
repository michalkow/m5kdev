# @m5kdev/backend

Composable Express server stack: Drizzle ORM, tRPC, and feature modules (auth, billing, file, AI, etc.).

## Consumption

This package is **source-only**. Consume it via the `exports` map in `package.json` with a TypeScript-aware bundler or runtime (e.g. in an app under `apps/*` that compiles or resolves these paths). Import by subpath, for example:

- `@m5kdev/backend/trpc`
- `@m5kdev/backend/types`
- `@m5kdev/backend/modules/auth/*`
- `@m5kdev/backend/modules/billing/*`

Do not rely on a default `main` entry; use the listed exports.

## Scripts

From repo root:

- **Lint:** `pnpm exec turbo lint --filter=@m5kdev/backend`
- **Type-check:** `pnpm exec turbo check-types --filter=@m5kdev/backend`
- **Test:** `pnpm exec turbo test --filter=@m5kdev/backend`
