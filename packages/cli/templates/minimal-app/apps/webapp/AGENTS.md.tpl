# AGENTS.md

## Frontend Stack

- React + TypeScript
- React Router v7
- HeroUI
- Tailwind CSS v4
- `nuqs` for URL state
- TanStack Query + tRPC

## Conventions

- Keep providers centralized in `src/Providers.tsx`.
- Keep routing in `src/Router.tsx`.
- Keep feature code grouped under `src/modules/<feature>/`.
- Prefer HeroUI primitives and existing framework utilities before adding custom abstractions.
- Use `useTranslation` for local app copy and rely on the bundled `web-ui` translations for auth routes.
