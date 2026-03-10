# @m5kdev/web-ui

Shared UI component library for the m5 monorepo: HeroUI, Radix UI primitives, and Tailwind CSS. Used by apps in `apps/` and by `@m5kdev/frontend`.

## Usage

From the repo root:

- **Lint:** `pnpm exec turbo lint --filter=@m5kdev/web-ui`
- **Type-check:** `pnpm exec turbo check-types --filter=@m5kdev/web-ui`

Import components and modules via the package `exports` (e.g. `@m5kdev/web-ui/components/ui/button`, `@m5kdev/web-ui/modules/auth/components/*`). See `package.json` `exports` for available entry points.

## Structure

- `src/components/ui/` – Base UI components (shadcn-style).
- `src/modules/` – Feature modules (auth, billing, table, charts, app) with components and types.
