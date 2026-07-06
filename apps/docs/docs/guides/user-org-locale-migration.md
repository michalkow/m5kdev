---
sidebar_position: 5
---

# User and organization locale migration

This guide covers upgrading existing apps to user/organization locale detection,
persistence, localized transactional email, and i18next sync.

## What changed in the stack

| Layer | Change |
| --- | --- |
| `@m5kdev/commons` | `auth.locale` helpers (`resolveAppLocale`, `toI18nLanguageTag`) and `USER_LOCALE_HEADER`. |
| `@m5kdev/backend` | `users.locale` and `organizations.locale` columns; locale resolution in Better Auth signup hooks; `getLocale` / `setLocale` tRPC; `BackendAppMetadata.locales` for app-wide locale config. |
| `@m5kdev/backend` | `createAppI18n` / `AppI18n` shared server i18next instance; exposed on module contexts and library hooks. |
| `@m5kdev/backend` email | `EmailService` resolves `subject` / `previewText` translation keys via `AppI18n`; injects `props.t` and `props.htmlLang` into templates. |
| `@m5kdev/frontend` | `AppConfigProvider.locales`, browser locale helpers, session → i18next sync, `useAuthLocale`. |
| `@m5kdev/web-ui` | Signup locale header, admin locale pickers, user preferences locale picker. |
| `@m5kdev/email` | `EmailLayout`, `CtaButton`, `EmailTranslateFn`, and template prop types. |
| App email package | Exports `emailResources` for server bootstrap; templates use injected `props.t` for React copy. |

## Database migration

`@m5kdev/backend` defines nullable `locale` columns on `users` and `organizations`.

### auth-e2e (reference app)

```bash
cd apps/auth-e2e/server
pnpm generate:schema
pnpm prepare:standard   # or prepare:waitlist / prepare:expo:*
```

### Other apps

Regenerate your composed schema and apply with your normal Drizzle workflow (`push`, `migrate`, etc.).

| Table | Column | Type | Notes |
| --- | --- | --- | --- |
| `users` | `locale` | `text`, nullable | Canonical app locale (`en`, `en_GB`, …) |
| `organizations` | `locale` | `text`, nullable | Inherited from creator or admin input |

## Shared locale config

```ts
// apps/<app>/shared/src/modules/app/locale.constants.ts
export const AUTH_LOCALE_CONFIG = {
  defaultLocale: "en",
  allowedLocales: ["en", "en_GB"],
} as const;
```

Canonical storage uses underscore region tags (`en_GB`). Browser inputs like `en-GB` normalize before persistence. i18next receives `en-GB` via `toI18nLanguageTag`.

## Server bootstrap

### App config (all modules)

Pass locale config at the same level as app name:

```ts
import { AUTH_LOCALE_CONFIG } from "<app-shared>/modules/app/locale.constants";

createBackendApp({
  app: {
    name: APP_NAME,
    urls: { web: appUrl, api: serverUrl },
    locales: AUTH_LOCALE_CONFIG,
  },
  // ...
});
```

`AuthModule`, `EmailService`, and `createBetterAuth` read `appConfig.locales` from this single source. Register server translations via top-level `i18n.resources`:

```ts
import { emailResources } from "<app-email-package>/resources";

createBackendApp({
  app: {
    name: APP_NAME,
    urls: { web: appUrl, api: serverUrl },
    locales: AUTH_LOCALE_CONFIG,
  },
  i18n: {
    resources: emailResources,
  },
});
```

`builtBackendApp.i18n` exposes the shared `AppI18n` instance for app code outside modules.

### CORS

```ts
import { USER_LOCALE_HEADER } from "@m5kdev/commons/modules/auth/auth.constants";

allowedHeaders: [
  "Content-Type",
  "Authorization",
  USER_LOCALE_HEADER,
  // ...
],
```

### Better Auth factory

```ts
createBetterAuth({
  orm: db.orm,
  schema: db.schema,
  services: { email: services.email.email },
  app: appConfig,
  i18n,
  config: {
    waitlist: false,
  },
});
```

Pass `i18n` from the auth factory context (`factory({ ..., i18n })`).

### Email templates

`EmailModule` only receives templates. At send time, `EmailService`:

1. Resolves the recipient locale (per-email rules below, or `OverrideOptions.locale`).
2. Builds `t` from `builtBackendApp.i18n`.
3. Translates template `subject` and `previewText` **keys** via `t(key, props)`.
4. Injects `props.t`, `props.htmlLang`, and the translated `previewText` into the React component.

Locale is resolved internally and is **not** passed into template props.

Email locale resolution:

| Email | Locale source |
| --- | --- |
| Verification, password reset, account deletion | `user.locale` |
| Organization invitation | `organization.locale` |
| Waitlist user invite | Inviting user's locale |
| Waitlist confirmation / admin waitlist invite | App `defaultLocale` |

## App email package pattern

Recommended structure:

```text
apps/<app>/email/src/
  resources.ts
  translations/
    en.ts
    en_GB.ts
  index.tsx
```

Export `emailResources` and `templates` separately. Register resources in server `app.ts` via `i18n.resources`.

### Translation resources

Map canonical locale tags to nested translation objects:

```ts
// apps/<app>/email/src/resources.ts
import type { BackendAppI18nResources } from "@m5kdev/backend/i18n/app-i18n";
import { en } from "./translations/en";
import { en_GB } from "./translations/en_GB";

export const emailResources = {
  en: { translation: en },
  en_GB: { translation: en_GB },
} satisfies BackendAppI18nResources;
```

Keys in `translations/en.ts` should match template `subject` / `previewText` keys and React `t(...)` calls (for example `verification.subject`, `verification.title`).

`EmailService` also derives `brandName` from `props.brand.name` when interpolating subject/preview keys.

### Template definition (translation keys)

`subject` and `previewText` are plain strings used as i18next keys — not functions and not pre-translated copy:

```ts
export const templates = {
  verification: {
    id: "verification",
    subject: "verification.subject",
    previewText: "verification.previewText",
    react: VerificationEmail,
  },
  organizationInvite: {
    id: "organization-invite",
    subject: "organizationInvite.subject",
    previewText: "organizationInvite.previewText",
    react: OrganizationInviteEmail,
  },
};
```

Without `i18n.resources` configured, these keys are sent as literal subject/preview text (useful only during early setup).

### React components use `props.t`

Compose app-specific content inside `EmailLayout` from `@m5kdev/email`. Use `CtaButton` for primary actions:

```tsx
import { Heading, Text } from "@react-email/components";
import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";
import type { Brand, EmailTranslateFn } from "@m5kdev/email/types";

function resolveT(t?: EmailTranslateFn): EmailTranslateFn {
  return t ?? ((key: string) => key);
}

const t = resolveT(props.t);

return (
  <EmailLayout previewText={props.previewText} brand={brand} htmlLang={props.htmlLang}>
    <Heading className="mb-4 text-2xl font-bold text-black">
      {t("verification.title")}
    </Heading>
    <Text className="mb-6 text-base text-gray-700">{t("verification.body")}</Text>
    <CtaButton href={url}>{t("verification.action")}</CtaButton>
  </EmailLayout>
);
```

- `props.t` — shared `AppI18n` translate function for React copy.
- `props.previewText` — already translated by `EmailService` before render.
- `props.htmlLang` — BCP 47 tag for `<html lang>` (derived from resolved locale).
- `brand` — passed by `EmailService` via `sendBrandTemplate`.

Do not add a per-email-package layout shell or i18next singleton. Use `@m5kdev/email` layout components.

### Migrating existing email packages

| Old pattern | New pattern |
| --- | --- |
| Local `i18n.ts` / `getEmailT(locale)` | Register `emailResources` in `createBackendApp`; use `props.t` |
| Custom `EmailShell` / `BaseEmail` layout | `EmailLayout` and `CtaButton` from `@m5kdev/email` |
| `subject: ({ locale, props }) => ...` functions | `subject: "verification.subject"` string key |
| `previewText` functions | `previewText: "verification.previewText"` string key |
| `locale` prop on email components | `t` and `htmlLang` props |
| Literal English `subject` / `previewText` | Same strings as keys in `i18n.resources` |

### Library hooks

`AuthServiceHooks.afterCreateOrganization` and `createBetterAuth` `afterCreateUser` receive `i18n`, `locale`, and `t` when server i18n is configured:

```ts
new AuthModule(undefined, {
  afterCreateOrganization: async ({ organization, t }) => {
    const title = t?.("onboarding.welcome", { name: organization.name });
  },
});
```

Register hook-specific keys in the same `i18n.resources` map in `app.ts`.

## Webapp providers

```tsx
<AppConfigProvider
  config={{
    appName: APP_NAME,
    appUrl: import.meta.env.VITE_APP_URL,
    serverUrl: import.meta.env.VITE_SERVER_URL,
    locales: AUTH_LOCALE_CONFIG,
  }}
>
```

## Upgrade checklist

1. Upgrade `@m5kdev/commons`, `@m5kdev/backend`, `@m5kdev/frontend`, `@m5kdev/web-ui`, and `@m5kdev/email`.
2. Migrate DB schema (`users.locale`, `organizations.locale`).
3. Add `AUTH_LOCALE_CONFIG` in app shared code.
4. Set `app.locales` in `createBackendApp` config.
5. Add `User-Locale` to CORS `allowedHeaders`.
6. Register `i18n.resources` in `createBackendApp` (email + any server-only strings).
7. Change template `subject` / `previewText` to translation keys; update React components to use `props.t`.
8. Pass `locales` into `AppConfigProvider` in the webapp.
9. Verify signup, admin create, preferences, hooks, and stored email subjects match locale.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| User/org `locale` is always `NULL` | Schema not migrated, or `app.locales` not set in `createBackendApp`. |
| Browser locale ignored on signup | Missing `User-Locale` in CORS, or `AppConfigProvider.locales` not set. |
| Email body still shows keys | Templates not calling `props.t`, or missing keys in `i18n.resources`. |
| Subject not localized | `subject` / `previewText` key missing from `i18n.resources`, or key mismatch with template export. |
| Subject shows `verification.subject` literally | `i18n.resources` not registered, or `app.locales` omitted (no `AppI18n` instance). |
| Hook cannot translate | `i18n` only available when `app.locales` is set; use `t` from hook context, not a local i18next instance. |

## Related docs

- [Auth module](/modules/auth)
- [Admin create verified user migration](/guides/admin-create-verified-user-migration)
