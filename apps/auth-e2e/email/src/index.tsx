import type { EmailTemplates, EmailTranslateFn } from "@m5kdev/backend/modules/email/email.service";
import { Heading, Text } from "@react-email/components";
import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";
import type { Brand } from "@m5kdev/email/types";
import type { FunctionComponent } from "react";

type BaseEmailProps = {
  brand?: Brand;
  previewText?: string;
  url?: string;
  t?: EmailTranslateFn;
  htmlLang?: string;
};

type OrganizationInviteProps = BaseEmailProps & {
  organizationName?: string;
  inviterName?: string;
  role?: string;
};

type WaitlistInviteProps = BaseEmailProps & {
  inviter?: string;
  name?: string;
};

function resolveBrand(brand?: Partial<Brand>): Brand {
  return {
    name: brand?.name ?? "Auth E2E Blog",
    logo: brand?.logo ?? "",
    tagline: brand?.tagline ?? "Authentication test workspace",
  };
}

function resolveT(t?: EmailTranslateFn): EmailTranslateFn {
  return t ?? ((key: string) => key);
}

function ActionEmail({
  brand,
  previewText,
  url,
  htmlLang,
  title,
  body,
  action,
}: BaseEmailProps & {
  title: string;
  body: string;
  action: string;
}) {
  return (
    <EmailLayout
      previewText={previewText ?? title}
      brand={resolveBrand(brand)}
      htmlLang={htmlLang}
    >
      <Heading className="mb-4 text-2xl font-bold text-black">{title}</Heading>
      <Text className="mb-6 text-base text-gray-700">{body}</Text>
      {url ? <CtaButton href={url}>{action}</CtaButton> : null}
    </EmailLayout>
  );
}

const VerificationEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as BaseEmailProps;
  const t = resolveT(emailProps.t);
  return (
    <ActionEmail
      {...emailProps}
      title={t("verification.title")}
      body={t("verification.body")}
      action={t("verification.action")}
    />
  );
};

const PasswordResetEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as BaseEmailProps;
  const t = resolveT(emailProps.t);
  return (
    <ActionEmail
      {...emailProps}
      title={t("passwordReset.title")}
      body={t("passwordReset.body")}
      action={t("passwordReset.action")}
    />
  );
};

const AccountDeletionEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as BaseEmailProps;
  const t = resolveT(emailProps.t);
  return (
    <ActionEmail
      {...emailProps}
      title={t("accountDeletion.title")}
      body={t("accountDeletion.body")}
      action={t("accountDeletion.action")}
    />
  );
};

const WaitlistConfirmationEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as BaseEmailProps;
  const t = resolveT(emailProps.t);
  return (
    <ActionEmail
      {...emailProps}
      title={t("waitlistConfirmation.title")}
      body={t("waitlistConfirmation.body")}
      action={t("waitlistConfirmation.action")}
    />
  );
};

const WaitlistInviteEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as BaseEmailProps;
  const t = resolveT(emailProps.t);
  return (
    <ActionEmail
      {...emailProps}
      title={t("waitlistInvite.title")}
      body={t("waitlistInvite.body")}
      action={t("waitlistInvite.action")}
    />
  );
};

const WaitlistUserInviteEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as WaitlistInviteProps;
  const t = resolveT(emailProps.t);
  const inviter = emailProps.inviter ?? "A teammate";
  const invitee = emailProps.name
    ? t("waitlistUserInvite.inviteeSuffix", { name: emailProps.name })
    : "";

  return (
    <ActionEmail
      {...emailProps}
      title={t("waitlistUserInvite.title", { inviter, invitee })}
      body={t("waitlistUserInvite.body")}
      action={t("waitlistUserInvite.action")}
    />
  );
};

const SystemWaitlistNotificationEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as BaseEmailProps;
  const t = resolveT(emailProps.t);
  return (
    <ActionEmail
      {...emailProps}
      title={t("systemWaitlistNotification.title")}
      body={t("systemWaitlistNotification.body")}
      action={t("systemWaitlistNotification.action")}
    />
  );
};

const OrganizationInviteEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as OrganizationInviteProps;
  const t = resolveT(emailProps.t);
  const organization = emailProps.organizationName ?? "an organization";
  const inviter = emailProps.inviterName ?? "A teammate";
  const role = emailProps.role ?? "member";

  return (
    <EmailLayout
      previewText={emailProps.previewText ?? t("organizationInvite.previewText", { inviterName: inviter, organizationName: organization })}
      brand={resolveBrand(emailProps.brand)}
      htmlLang={emailProps.htmlLang}
    >
      <Heading className="mb-4 text-2xl font-bold text-black">
        {t("organizationInvite.title", { inviterName: inviter, organizationName: organization })}
      </Heading>
      <Text className="mb-6 text-base text-gray-700">{t("organizationInvite.body", { role })}</Text>
      {emailProps.url ? (
        <CtaButton href={emailProps.url}>{t("organizationInvite.action")}</CtaButton>
      ) : null}
    </EmailLayout>
  );
};

export const templates = {
  accountDeletion: {
    id: "account-deletion",
    subject: "accountDeletion.subject",
    previewText: "accountDeletion.previewText",
    react: AccountDeletionEmail,
  },
  verification: {
    id: "verification",
    subject: "verification.subject",
    previewText: "verification.previewText",
    react: VerificationEmail,
  },
  waitlistConfirmation: {
    id: "waitlist-confirmation",
    subject: "waitlistConfirmation.subject",
    previewText: "waitlistConfirmation.previewText",
    react: WaitlistConfirmationEmail,
  },
  passwordReset: {
    id: "password-reset",
    subject: "passwordReset.subject",
    previewText: "passwordReset.previewText",
    react: PasswordResetEmail,
  },
  systemWaitlistNotification: {
    id: "system-waitlist-notification",
    subject: "systemWaitlistNotification.subject",
    previewText: "systemWaitlistNotification.previewText",
    react: SystemWaitlistNotificationEmail,
  },
  waitlistInvite: {
    id: "waitlist-invite",
    subject: "waitlistInvite.subject",
    previewText: "waitlistInvite.previewText",
    react: WaitlistInviteEmail,
  },
  waitlistUserInvite: {
    id: "waitlist-user-invite",
    subject: "waitlistUserInvite.subject",
    previewText: "waitlistUserInvite.previewText",
    react: WaitlistUserInviteEmail,
  },
  organizationInvite: {
    id: "organization-invite",
    subject: "organizationInvite.subject",
    previewText: "organizationInvite.previewText",
    react: OrganizationInviteEmail,
  },
} satisfies EmailTemplates;
