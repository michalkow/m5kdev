---
sidebar_position: 1
---

# Getting started

The docs site is a private workspace app at `apps/docs`. It uses Docusaurus with
the docs plugin mounted at `/`, so documentation is the first screen.

## Run locally

From the monorepo root:

```sh
pnpm docs:dev
```

Docusaurus serves the site on `http://localhost:3000` by default.

## Build

```sh
pnpm docs:build
```

The static output is written to `apps/docs/build`.

## Add docs

- Add feature-specific guides under `docs/modules/<module>/`.
- Add package ownership notes under `docs/packages/`.
- Prefer linking package pages to module pages instead of duplicating module usage
  instructions.
