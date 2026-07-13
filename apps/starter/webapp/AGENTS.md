# AGENTS.md

## Frontend Stack

- React 19 + TypeScript
- React Router v7
- HeroUI v3
- Tailwind CSS v4
- `nuqs` for URL state
- TanStack Query + tRPC
- i18next for all user-facing copy

## Conventions

- Keep providers centralized in `src/Providers.tsx`.
- Keep routing in `src/Router.tsx`.
- Keep feature code grouped under `src/modules/<feature>/` with `components/` and `hooks/` subfolders.
- Prefer HeroUI primitives and existing framework utilities before adding custom abstractions.
- Components stay display-focused: queries, mutations, URL state, and effects live in custom hooks (`hooks/use<Feature>Route.ts` composed from smaller hooks); ephemeral UI state (modal open, selected row) may stay in the component. Reusable tRPC actions (delete, publish) get their own hook.
- Derive values during render instead of syncing state with `useEffect`.
- Forms are uncontrolled: HeroUI `Form` + `TextField` with native HTML validation and `FieldError`, values read from `FormData` on submit. No form libraries. Extra checks that HTML validation cannot express happen in the submit handler.
- Fetch through `useTRPC()` + `queryOptions`/`mutationOptions` only; invalidate with `queryFilter()` after mutations.
- Use `useTranslation` for local app copy and rely on the bundled `web-ui` translations for auth routes.
- The `posts` module is the reference implementation; detailed guides live in `.cursor/rules/frontend-*.mdc`.
