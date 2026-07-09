---
sidebar_position: 17
---

# Email module

The email module renders React Email templates and sends them through Resend,
with locale-aware subjects, a local store mode for development, and a browser
preview module.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `EmailModule` + `EmailService` (send, brand, locale, store mode) and `EmailPreviewModule`. |
| `@m5kdev/email` | Shared React Email layout (`EmailLayout`, `CtaButton`, brand chrome) and template prop types. |
| App email package | Per-app template components and `emailResources` registered in `createBackendApp`. |

## Registration

```ts
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";

backendApp.use(new EmailModule(templates));
```

The Resend client, sender address, and mode come from the kernel
(`createBackendApp({ resend, email })`); brand and app metadata come from
`app` config. In non-production modes the service writes rendered emails to an
output directory instead of (or in addition to) sending, and exposes
`listStoredEmails`, `readStoredEmail`, `findLatestStoredEmail`, and
`clearStoredEmails` — which e2e tests use to assert on sent mail.

## Sending

- `sendTemplate(...)` / `sendBrandTemplate(...)` — render a registered template
  with brand chrome and i18n, then send.
- Built-in auth flows: `sendVerification`, `sendResetPassword`,
  `sendDeleteAccountVerification`, `sendOrganizationInvite`,
  `sendWaitlistConfirmation`, `sendWaitlistInvite`, `sendWaitlistUserInvite`,
  and `sendSystemWaitlistNotification` (to `SYSTEM_NOTIFICATION_EMAIL`).

## Email preview module

`EmailPreviewModule` mounts a dev-only Express UI for stored emails:

```ts
backendApp.use(new EmailPreviewModule({ mountPath: "/__emails", allowDelete: true }));
```

## App template pattern

App email packages compose content inside shared layout components:

```tsx
import { Heading, Text } from "@react-email/components";
import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";

export function VerificationEmail({ previewText, brand, url, t, htmlLang }) {
  return (
    <EmailLayout previewText={previewText} brand={brand} htmlLang={htmlLang}>
      <Heading>{t("verification.title")}</Heading>
      <Text>{t("verification.body")}</Text>
      <CtaButton href={url}>{t("verification.action")}</CtaButton>
    </EmailLayout>
  );
}
```

Register templates with `EmailModule` and translation keys for `subject` /
`previewText`. Subjects and bodies follow the recipient's locale — see
[User and organization locale migration](/guides/user-org-locale-migration).

## Related docs

- [User and organization locale migration](/guides/user-org-locale-migration)
- [`@m5kdev/email` package](/packages/email)
