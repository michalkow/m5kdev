---
sidebar_position: 17
---

# Email module

`EmailModule` is a Core Module. It renders registered Email templates and sends
them through Resend. 1.0 apps register it with Auth (Auth depends on EmailModule).
It is not a Notification, not a Channel, and not `@m5kdev/email` chrome.

`@m5kdev/email` is shared React Email chrome (layout, buttons, brand types).
Product templates live in the app email package.

`EmailPreviewModule` is a Kernel-exported helper in the same package — not a
Core Module. It mounts only when EmailService mode is `store` and env is not
production.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `EmailModule` + `EmailService` (send, brand, locale, exclusive `send` / `store` / `log` modes). `EmailPreviewModule` is a helper, not Core. |
| `@m5kdev/email` | Shared React Email layout (`EmailLayout`, `CtaButton`, brand chrome) and template prop types. |
| App email package | Per-app template components and `emailResources` registered in `createBackendApp`. |

## Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";

createBackendApp(config, [new EmailModule(templates)]);
```

The Resend client, sender address, and mode come from the kernel
(`createBackendApp({ resend, email })`); brand and app metadata come from
`app` config.

Mode is exclusive: `send` (Resend only), `store` (write JSON to an output
directory only), or `log` (log only). Store is not a dual-write on top of
sending. Store mode exposes `listStoredEmails`, `readStoredEmail`,
`findLatestStoredEmail`, and `clearStoredEmails` — which e2e tests use to
assert on mail that was stored, not sent.

## Sending

- `sendTemplate(...)` / `sendBrandTemplate(...)` — render a registered Email
  template with brand chrome and i18n, then deliver according to mode.
- Built-in Auth wrappers: `sendVerification`, `sendResetPassword`,
  `sendDeleteAccountVerification`, `sendOrganizationInvite`.
- Waitlist wrappers stay public (`sendWaitlistConfirmation`,
  `sendWaitlistInvite`, `sendWaitlistUserInvite`,
  `sendSystemWaitlistNotification`) and fail at send time if that Email
  template is not registered.

Required Email templates: `verification`, `passwordReset`, `accountDeletion`,
`organizationInvite`. Optional: waitlist templates, `trialEnding`, and extra
keys (for example a Notification kind’s Email template name). Notification may
call `sendTemplate`; EmailModule does not own inbox or Channel policy.

`trialEnding` is optional on `EmailTemplates`. Billing uses it for the Trial
cancel warning; omit it to skip send. See the
[Billing module](/modules/billing) and
[Billing trial-ending email in 0.34.0](/guides/v0.34.0-billing-trial-ending-email-migration).

## Email preview helper

`EmailPreviewModule` mounts an unauthenticated Express UI for stored emails
only when mode is `store` and env is not production. Registering it in
production or in `send` mode is a no-op (routes are not mounted).

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { EmailPreviewModule } from "@m5kdev/backend/modules/email/email.preview.module";

createBackendApp(config, [
  new EmailPreviewModule({ mountPath: "/__emails", allowDelete: true }),
]);
```

`mountPath` defaults to `/__emails`. Inbox and detail HTML use that path.

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
`previewText`. Subjects and bodies follow the recipient's locale (pass
`OverrideOptions.locale`; EmailModule does not load User or Organization) —
see [User and organization locale migration](/guides/user-org-locale-migration).

## Related docs

- [Email preview gate in 0.36.0](/guides/v0.36.0-email-preview-gate-migration)
- [User and organization locale migration](/guides/user-org-locale-migration)
- [`@m5kdev/email` package](/packages/email)
- [Billing trial-ending email](/guides/v0.34.0-billing-trial-ending-email-migration)
- [Notification](/modules/notification) — email Channel may call EmailModule
