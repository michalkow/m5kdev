---
sidebar_position: 17
---

# Email module

The email module connects backend email service behavior with templates from the
email package.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | Email module registration, `EmailService`, and locale-aware send behavior. |
| `@m5kdev/email` | Shared React Email layout (`EmailLayout`, `CtaButton`, brand chrome) and template prop types. |
| App email package | Per-app template components and `emailResources` registered in `createBackendApp`. |

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

Register templates with `EmailModule` and translation keys for `subject` / `previewText`. See [User and organization locale migration](/guides/user-org-locale-migration).

## Related docs

- [User and organization locale migration](/guides/user-org-locale-migration)
- [`@m5kdev/email` package](/packages/email)
