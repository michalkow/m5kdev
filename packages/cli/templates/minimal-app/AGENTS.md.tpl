# AGENTS.md

## About the Project

**{{APP_NAME}}** is a minimal app scaffolded for the m5kdev stack.

{{APP_DESCRIPTION}}

## Repository Structure

- `apps/shared` holds shared Zod schemas and constants.
- `apps/server` holds the backend composition root, modules, auth wiring, and database scripts.
- `apps/webapp` holds the React app shell, routes, providers, and the `posts` feature.
- `apps/email` holds the email templates used by auth flows and local email delivery.

## Backend Conventions

- Keep repository, service, and transport layers separate inside each module.
- Register modules in `apps/server/src/app.ts` via `createBackendApp(config, [modules])`.
- Use `BaseModule` subclasses for app modules; the kernel wires repositories, services, and tRPC.
- Keep tRPC files focused on input/output wiring and delegate logic to services.
- Do not create Drizzle migrations by hand. Use the scaffolded config and your project migration workflow later if you need generated migrations.

## Frontend Conventions

- Keep the app shell shape: `NuqsAdapter` + `BrowserRouter` + `Providers`.
- Compose global providers only in `apps/webapp/src/Providers.tsx`.
- Use `AppConfigProvider` and `AppTrpcQueryProvider` from `@m5kdev/frontend`; use `@m5kdev/web-ui` for web-only UI.
- Define app roles in `apps/shared/src/modules/app/roles.constants.ts` and pass `roles: APP_ROLES_CONFIG` through `AppConfigProvider` and `createBackendApp` metadata.
- Add role display labels in `apps/webapp/translations/app.json` using keys like `organization.role.editor` (resolved as `app:organization.role.editor`).
- When adding custom roles, also extend module grants (for example `*.grants.ts`) so permissions match the new role keys.
- For upgrading existing apps, see the docs site guide `apps/docs/docs/guides/custom-app-roles-migration.md`.
- Use `nuqs` for URL state, React Router for routing, HeroUI for UI primitives, and Tailwind v4 for styling.
- Prefer shared framework utilities from `@m5kdev/frontend` and `@m5kdev/web-ui` before adding local duplicates.
- React 19 idioms: no `forwardRef` (pass `ref` as a prop), no `defaultProps`, use `startTransition`/`useDeferredValue` for low-priority updates.
- Prefer HeroUI v3 components over hand-rolled HTML + Tailwind whenever an equivalent exists; Tailwind is for layout and styling on top of them.
- Keep components display-focused: data fetching, mutations, URL state, and effect chains live in custom hooks under `modules/<feature>/hooks/` (small focused hooks composed into one screen-level hook, e.g. `usePostsRoute`). Ephemeral UI state (modal open, selected row) may stay in the component. Extract reusable tRPC actions (delete, publish) into their own hooks.
- Fetch all server data with TanStack Query over tRPC (`useTRPC()` + `queryOptions`/`mutationOptions`); invalidate with the matching `queryFilter()` after mutations. No `fetch`/axios.
- Forms are uncontrolled HeroUI `Form` + `TextField`/`TextArea` with native HTML validation (`isRequired`, `type`, `minLength`) and `FieldError`; read values from `FormData` on submit. Never add form libraries (react-hook-form, formik). Validation that HTML cannot express (e.g. confirm-password) happens in the submit handler.
- All user-facing copy goes through i18next (`useTranslation`); keys live in `apps/webapp/translations/`.
- The `posts` feature (`apps/webapp/src/modules/posts/`) is the reference implementation for these conventions; see `.cursor/rules/frontend-*.mdc` for the detailed guides.
