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

| Package           | What it owns                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@m5kdev/backend` | `EmailModule` + `EmailService` (send, brand, locale, exclusive `send` / `store` / `log` modes). `EmailPreviewModule` is a helper, not Core. |
| `@m5kdev/email`   | Shared React Email layout (`EmailLayout`, `CtaButton`, brand chrome) and template prop types.                                               |
| App email package | Per-app template components and `emailResources` registered in `createBackendApp`.                                                          |

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

## Immediate sends for an Experience

Register server-only email profiles alongside the Experience definitions in
`app.experiences`. A profile may name a sender and a template set:

```ts
emailProfiles: {
  radarMail: { from: "Radar <reports@radar.example>", templateSet: "radar" },
  partnerMail: { from: "Partner <reports@partner.example>", templateSet: "partner" },
},
// Each Experience definition references its profile by key:
// radar: { product: "radar", brand: "radar", webOrigin: "https://radar.example",
//          apiOrigin: "https://radar.example", emailProfile: "radarMail" }
```

Register named sets on the existing module. Each set is a complete
`EmailTemplates` registration, including the required Auth templates; no implicit
merge with the default templates occurs. They can reuse components and only
replace the app's copy or layout:

```ts
new EmailModule(sharedTemplates, {
  templateSets: { radar: radarTemplates, partner: partnerTemplates },
});
```

Use the existing service for immediate app-authored messages:

```ts
await services.email.sendBrandTemplate(
  recipient.email,
  "reportReady",
  { reportTitle: report.title },
  {
    experience, // resolved request descriptor or a configured Experience id
    linkPaths: { url: `/reports/${report.id}`, settingsUrl: "/settings" },
    locale: recipient.locale,
  },
);
```

`sendTemplate` accepts the same options. The service looks up the Experience in
its immutable registry at every send. A descriptor's supplied identity fields
cannot override approved configuration. Templates receive `experience` (the
public descriptor), `brand`, and the named canonical links. For example, the
`url` prop above becomes `https://radar.example/reports/7` for the Radar
Experience. Cross-Experience/external destinations and reserved identity prop
names in `linkPaths` fail before delivery. Existing arbitrary content props are
not scanned or rewritten; put framework-generated destinations in `linkPaths`.

Explicit registries require an Experience for every send, including when a
registry currently has only one definition. Missing, unknown or disabled
references return a configuration/context error; the registry's default does
not guess the intended identity. Unknown profile or template-set references
fail at boot. An unregistered template in the selected set fails without falling
back to another set. Existing `app.name`/`app.urls`/`app.brand` single-Experience
shorthand continues to send without new context and retains its brand defaults
and existing per-send brand customization.

Sender precedence is per-send `from`, selected template `from`, email-profile
`from`, then the existing service/global sender. Subject and preview precedence
is per-send literal override, selected template translation/literal, then the
existing template-key/subject fallback. Locale precedence remains per-send
`locale`, i18n default, then app default. Pass the recipient's saved locale;
EmailService does not load or change User preferences, or derive locale from a
visited brand. In explicit-registry mode, content props cannot replace the
validated `brand` or `experience`, and `linkPaths` replaces content props of the
same name.

All identities use the existing exclusive send/store/log delivery path. Stored
email readers expose the selected sender, template id, subject, public descriptor,
brand, canonical link props and actual rendered HTML. Log mode includes the sender
and resolved props. Registry email profiles and transport credentials are not
injected into template props or stored output. Interleaved sends keep independent
presentation context.

Auth now owns bound verification, recovery, Organization invitation and waitlist
flows. Use those owning Auth operations to issue complete signed links; Email
wrappers format messages and do not create resource authority. Account-claim
sign-in links remain stored for administrator retrieval rather than emailed.
Background communication policy and trial producers remain separate checkpoints;
registering domains alone does not migrate those producers.

## Scheduled, admin and webhook communication

Register an optional policy on the existing module when an operation has no
initiating website. The callback receives only trusted, server-loaded event and
resource identifiers: `event`, optional `eventId`, `userId`, `organizationId` and
`resourceId`. It returns one schema-validated `ExperienceId`, synchronously or
asynchronously. It does not receive the recipient's address or a saved request.

```ts
import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import type { CommunicationPolicy } from "@m5kdev/backend/modules/email/email.schema";

// App-owned explicit routing for these resources; choose from trusted ids.
const deliveryExperiences = new Map([
  ["report-7", experienceIdSchema.parse("radar")],
  ["report-8", experienceIdSchema.parse("partner")],
]);
const communicationPolicy: CommunicationPolicy = ({ event, resourceId }) =>
  event === "app.report-ready" && resourceId
    ? deliveryExperiences.get(resourceId)
    : undefined;

new EmailModule(templates, { templateSets, communicationPolicy });
```

In the owning service, load and authorize the current resource first, then
resolve presentation before creating any branded side effect or sending:

```ts
const selected = await email.resolveCommunicationExperience({
  experienceId: queued.experienceId, // validated ExperienceId, when already bound
  context: {
    event: "app.report-ready",
    eventId,
    organizationId: report.organizationId,
    resourceId: report.id,
  },
});
if (selected.isErr()) return err(selected.error);
const experience = selected.value;
// Use this same descriptor for any generated action/return link, then send.
return email.sendBrandTemplate(
  recipient.email,
  "reportReady",
  { title: report.title },
  {
    experience,
    linkPaths: { url: `/reports/${report.id}` },
    locale: recipient.locale,
  },
);
```

Resolution precedence is explicit:

1. A supplied `experienceId` is validated against the current registry; policy
   is not invoked. Malformed, removed or disabled references fail without fallback.
2. Without a bound id, a registered policy requires valid context and must return
   exactly one currently approved id. Missing/undefined/null/ambiguous/invalid
   output or a rejected callback fails, including in shorthand mode.
3. Without a bound id or registered policy, supported single-Experience shorthand
   uses its normal default. Explicit registries, even with one entry, fail.

The resolver returns a `ServerResultAsync<PublicExperience>`. Types and runtime
schemas are exported from `modules/email/email.schema`; `ExperienceId` is the
existing commons schema-derived brand. Raw strings at a queue/config boundary
must be parsed, not asserted into that type. Direct manual EmailService
composition may pass `communicationPolicy` too; its new resolver requires an app
registry. Existing manual send APIs remain supported.

Policy runs once per resolution. Existing send methods never call it implicitly;
pass the selected descriptor into their normal options. The send re-resolves its
id against approved config and keeps the existing sender/template/locale/override
precedence. Policy selection is presentation, not authorization or event-delivery
deduplication. A retry may resolve again. Billing trial-ending production uses
this contract before creating its Portal, with event `billing.trial-will-end`,
trusted eventId/organizationId and Subscription id as resourceId. The same selected
descriptor supplies Portal context and the actual send.

Delayed work stores only an Experience id and existing resource identifiers, then
reloads resources, scope, Grants, Entitlements, expiry and locale at execution.
Retain referenced Experience ids until work is drained or explicitly migrated.
Older no-reference jobs keep the shorthand default; strict adoption needs an
explicit resource-based policy or those jobs fail. See [Workflow](/modules/workflow)
for the validated payload shape and worker registration.

## Optional template availability

Optional producers can ask EmailService without duplicating profile/set lookup:

```ts
const reachable = email.hasTemplate({
  scope: "any",
  templateKey: "trialEnding",
});
const selected = email.hasTemplate({
  scope: "experience",
  templateKey: "trialEnding",
  experienceId: experience.id,
});
// Both return ServerResult<boolean>; neither invokes policy or sends.
```

The schema-derived input is exported from `modules/email/email.schema`. `any`
considers only enabled Experiences' actual selected complete sets. Unreferenced or
disabled-only sets, and base templates shadowed by every enabled named set, do not
make a feature reachable. `experience` re-resolves its explicit branded id; an
invalid/removed/disabled id is an error, while an absent optional template in a
valid selection is false. It does not fall back to base templates. Manual legacy
EmailService without a registry can inspect its base set with `scope: "any"`; selected
checks require a registry.

Billing uses any-reachable availability before requiring policy for an optional
trial warning, then selected availability after its one policy resolution. No
reachable template keeps the existing successful no-warning behavior; a reachable
message with invalid policy fails before Portal/send. A selected set missing the
optional template skips that warning. Normal send APIs retain their missing-template
error behavior and never choose a policy implicitly.

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

### Existing waitlist send helpers

`sendWaitlistInvite` and `sendWaitlistUserInvite` keep raw-code authoring in the
single-Experience shorthand. With strict `app.experiences`, obtain a complete link
from Auth's authorized issuing operations and pass it as `options.linkPaths.url`.
Missing links fail before delivery. These Email helpers cannot mint a valid Auth
continuation from a raw code and do not replace Auth's resource authorization.
