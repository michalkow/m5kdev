---
sidebar_position: 6
---

# Custom app roles migration

This guide covers upgrading existing apps to the shared role registry that drives
backend validation, admin/org UI pickers, and app-owned role labels.

## What changed in the stack

| Layer | Change |
| --- | --- |
| `@m5kdev/commons` | `AuthRolesConfig`, `DEFAULT_AUTH_ROLES`, `defineAuthRoles`, `createRoleValueSchema`, `getAppRoleTranslationKey`, `isAllowedRole`. |
| `@m5kdev/backend` | `BackendAppMetadata.roles`; `createOrganizationSchemas(roles)` factory in `auth.dto.ts`; `AuthService` validates organization roles; `createAuthTRPC` uses app role schemas. |
| `@m5kdev/frontend` | `AppConfigProvider.roles`, `useAppRoles`, `useRoleLabel`; `useOrganizationAccess` derives `managerRoles` / `assignableRoles` from config. |
| `@m5kdev/web-ui` | Admin and organization management UIs read role lists and labels from config instead of hardcoded enums. |
| App shared + webapp | `roles.constants.ts` and `translations/app.json` become the developer surface for role keys and display labels. |

New apps scaffolded from the minimal CLI template already include `APP_ROLES_CONFIG`,
`app.json` role labels, and provider/bootstrap wiring. Existing apps follow the
steps below.

## Database migration

**No schema change is required.** User, organization, and team membership roles
are already stored as plain `text` columns (`users.role`, `members.role`,
`teamMembers.role`, session active-role fields).

Custom role keys (for example `editor`) work as soon as app config, grants, and
translations are updated. Existing rows keep their stored role strings.

## Shared role config

Define roles once in app shared code, mirroring the locale config pattern:

```ts
// apps/<app>/shared/src/modules/app/roles.constants.ts
import { defineAuthRoles } from "@m5kdev/commons/modules/auth/auth.roles";

export const APP_ROLES_CONFIG = defineAuthRoles({
  user: {
    roles: ["user", "admin"],
  },
  organization: {
    roles: ["member", "admin", "owner", "editor"],
    managerRoles: ["admin", "owner"],
    assignableRoles: ["member", "admin", "editor"],
    defaultRole: "member",
  },
  team: {
    roles: ["member", "manager", "owner"],
    managerRoles: ["manager", "owner"],
    assignableRoles: ["member", "manager"],
    defaultRole: "member",
  },
});
```

### Scope fields

| Field | Purpose |
| --- | --- |
| `roles` | Canonical role keys for the scope. Used for backend validation and UI option lists. |
| `managerRoles` | Roles that can manage organization settings, members, and child orgs. Defaults to built-in values when omitted. |
| `assignableRoles` | Roles shown in org self-service invite/member pickers (`AuthOrganizationMembersRoute`). Defaults to all `roles` when omitted. Platform admin org management (`AuthAdminOrganizationManagement`) always offers every configured `roles` key. |
| `defaultRole` | Bootstrap default for new members or pickers. Falls back to the first configured role when omitted or invalid. |

When `managerRoles` or `assignableRoles` reference keys not present in `roles`,
the stack filters them to valid keys and falls back to defaults.

If `roles` is omitted entirely for a scope, `DEFAULT_AUTH_ROLES` is used for that
scope.

## Server bootstrap

Pass the same config object used by the webapp:

```ts
import { APP_ROLES_CONFIG } from "<app-shared>/modules/app/roles.constants";

createBackendApp({
  app: {
    name: APP_NAME,
    urls: { web: appUrl, api: serverUrl },
    locales: AUTH_LOCALE_CONFIG,
    roles: APP_ROLES_CONFIG,
  },
  // ...
});
```

`AuthModule` reads `appConfig.roles` and wires:

- Dynamic Zod schemas for admin organization member add/update
- `AuthService` validation (`BAD_REQUEST` for unknown organization role keys)

No `AuthModule` constructor change is required unless you also override grants.

## Grants for custom roles

Role config does **not** replace grants. For each new role key, add matching
entries in module grant maps (for example `auth.grants.ts`, `file.grants.ts`).

Example: adding organization role `editor`:

```ts
import { flattenNestedGrants } from "@m5kdev/backend/modules/base/base.grants";

new AuthModule(
  flattenNestedGrants({
    auth: {
      organization: {
        editor: { read: "all", write: "own" },
        // keep existing owner/admin/member entries
      },
    },
  })
);
```

Grant `role` strings must match keys in `APP_ROLES_CONFIG`. Mismatches cause
permission checks to deny access even when the UI allows assignment.

## Webapp providers

```tsx
import { APP_ROLES_CONFIG } from "<app-shared>/modules/app/roles.constants";

<AppConfigProvider
  config={{
    appName: APP_NAME,
    appUrl: import.meta.env.VITE_APP_URL,
    serverUrl: import.meta.env.VITE_SERVER_URL,
    locales: AUTH_LOCALE_CONFIG,
    roles: APP_ROLES_CONFIG,
  }}
>
```

## Role display translations

Add labels in the app `app` i18n namespace (`apps/<app>/webapp/translations/app.json`).
The Vite i18next loader resolves the filename `app.json` to namespace `app`.

```json
{
  "user.role.user": "User",
  "user.role.admin": "Admin",
  "organization.role.member": "Member",
  "organization.role.admin": "Admin",
  "organization.role.owner": "Owner",
  "organization.role.editor": "Content editor",
  "team.role.manager": "Manager"
}
```

### Translation key contract

| Scope | Key in `app.json` | Resolved i18n key |
| --- | --- | --- |
| User | `user.role.{key}` | `app:user.role.{key}` |
| Organization | `organization.role.{key}` | `app:organization.role.{key}` |
| Team | `team.role.{key}` | `app:team.role.{key}` |

`useRoleLabel(scope)` resolves `app:{scope}.role.{key}` first, then falls back to
`web-ui:organization.roles.{key}` for built-in organization roles (`member`,
`admin`, `owner`), then the raw role key string.

Apps that omit `app.json` entries still render sensibly for built-in organization
roles via the `web-ui` fallback.

## Frontend API changes

### Hooks

| Hook | Use |
| --- | --- |
| `useAppRoles()` | Full normalized config for all scopes. |
| `useAppRoles("organization")` | Normalized config for one scope (`roles`, `managerRoles`, `assignableRoles`, `defaultRole`). |
| `useRoleLabel("organization")` | Returns `(role: string) => string` for display labels. |

`useOrganizationAccess` now returns `assignableRoles` and `organizationRoles` from
config. `AuthOrganizationRole` is `string` (no longer a fixed union).

### Route props (optional overrides)

`managerRoles` and `assignableRoles` on organization routes remain supported as
**overrides** atop config. New apps can omit them:

```tsx
// Before
<AuthOrganizationMembersRoute managerRoles={["admin", "owner"]} />

// After (defaults from APP_ROLES_CONFIG)
<AuthOrganizationMembersRoute />
```

### Remove app-local hardcoding

Delete or replace these patterns when upgrading:

| Old pattern | New pattern |
| --- | --- |
| `const ORGANIZATION_ROLES = ["member", "admin", "owner"]` | `useAppRoles("organization").roles` |
| `managerRoles={["admin", "owner"]}` on every route | Omit prop; configure in `roles.constants.ts` |
| Hardcoded role labels in admin/org components | `useRoleLabel("user" \| "organization" \| "team")` |
| `organizationRoleOptions` with English labels | Org routes: `useAppRoles("organization").assignableRoles` + `useRoleLabel`; admin org management: `organizationRoles.roles` |
| `AuthOrganizationRole` union type | `string`, or derive from app shared config if you need stricter typing |

### Better Auth client typing

Better Auth client plugins still type some role fields as built-in unions. App
code that assigns custom roles may need a narrow cast at the call site until
client types are widened. The stack already does this in `@m5kdev/web-ui` admin
and member flows.

## End-to-end example: add `editor` organization role

1. Add `editor` to `APP_ROLES_CONFIG.organization.roles` and `assignableRoles`.
2. Pass `roles: APP_ROLES_CONFIG` in server `app.ts` and webapp `Providers.tsx`.
3. Add `"organization.role.editor": "Content editor"` to `translations/app.json`.
4. Extend `auth.grants.ts` (and any other module grants) with an `editor` entry.
5. Remove hardcoded `managerRoles` route props if config already defines them.
6. Verify:
   - Admin org member UI shows "Content editor" in the role picker.
   - Inviting/assigning `editor` succeeds.
   - Assigning an unknown role (for example `superuser`) returns `BAD_REQUEST`.
   - Permission checks match the grants you defined for `editor`.

See [auth-e2e `roles.constants.ts`](https://github.com/michalkow/m5kdev/blob/main/apps/auth-e2e/shared/src/modules/app/roles.constants.ts) for a working reference.

## Upgrade checklist

1. Upgrade `@m5kdev/commons`, `@m5kdev/backend`, `@m5kdev/frontend`, and `@m5kdev/web-ui`.
2. Add `apps/<app>/shared/src/modules/app/roles.constants.ts` (or keep defaults by omitting `roles` everywhere).
3. Set `app.roles` in `createBackendApp` config.
4. Pass `roles` into `AppConfigProvider` in the webapp.
5. Add `apps/<app>/webapp/translations/app.json` with role label keys.
6. Extend module grants for any custom role keys beyond built-ins.
7. Remove duplicated `ORGANIZATION_ROLES` constants and hardcoded route `managerRoles` props.
8. Replace hardcoded admin/org role labels with `useRoleLabel`.
9. Verify admin user management, org member management, and invitation flows.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Role picker still shows only member/admin/owner | `roles` not passed to `AppConfigProvider`, or route `assignableRoles` override is narrower than config. |
| Custom role saves but UI shows raw key | Missing entry in `translations/app.json` and no `web-ui` fallback for that key. |
| API rejects custom role with `BAD_REQUEST` | Role key missing from `APP_ROLES_CONFIG.organization.roles`, or server bootstrap missing `app.roles`. |
| User can be assigned role but gets forbidden on action | Grants not updated for the new role key. |
| Manager cannot access org settings | `managerRoles` in config does not include their role; or route still passes a narrower `managerRoles` override. |
| TypeScript errors on `inviteMember` / `createUser` | Better Auth client union types; cast payload at call site (see web-ui reference implementation). |

## Related docs

- [Auth module](/modules/auth)
- [User and organization locale migration](/guides/user-org-locale-migration)
- [Module grants guide](https://github.com/michalkow/m5kdev/blob/main/.cursor/rules/module-grants-guide.mdc) (repository)
