/** @jsxRuntime automatic */
import { Heading, Text } from "@react-email/components";
import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";
import type { Brand, EmailTranslateFn } from "@m5kdev/email/types";

function resolveT(t?: EmailTranslateFn): EmailTranslateFn {
  return t ?? ((key: string) => key);
}

interface WaitlistEmailProps {
  previewText: string;
  url?: string;
  brand: Brand;
  t?: EmailTranslateFn;
  htmlLang?: string;
}

function WaitlistActionEmail({
  previewText,
  url,
  brand,
  htmlLang,
  title,
  body,
  action,
}: WaitlistEmailProps & { title: string; body: string; action: string }) {
  return (
    <EmailLayout previewText={previewText} brand={brand} htmlLang={htmlLang}>
      <Heading className="mb-4 text-2xl font-bold text-black">{title}</Heading>
      <Text className="mb-6 text-base text-gray-700">{body}</Text>
      {url ? <CtaButton href={url}>{action}</CtaButton> : null}
    </EmailLayout>
  );
}

export function WaitlistConfirmationEmail(props: WaitlistEmailProps) {
  const t = resolveT(props.t);
  return (
    <WaitlistActionEmail
      {...props}
      title={t("waitlistConfirmation.title")}
      body={t("waitlistConfirmation.body")}
      action={t("waitlistConfirmation.action")}
    />
  );
}

export function WaitlistInviteEmail(props: WaitlistEmailProps) {
  const t = resolveT(props.t);
  return (
    <WaitlistActionEmail
      {...props}
      title={t("waitlistInvite.title")}
      body={t("waitlistInvite.body")}
      action={t("waitlistInvite.action")}
    />
  );
}

export function WaitlistUserInviteEmail(
  props: WaitlistEmailProps & { inviter?: string; name?: string }
) {
  const t = resolveT(props.t);
  const inviter = props.inviter ?? "A teammate";
  const invitee = props.name ? t("waitlistUserInvite.inviteeSuffix", { name: props.name }) : "";
  return (
    <WaitlistActionEmail
      {...props}
      title={t("waitlistUserInvite.title", { inviter, invitee })}
      body={t("waitlistUserInvite.body")}
      action={t("waitlistUserInvite.action")}
    />
  );
}

export function SystemWaitlistNotificationEmail(props: WaitlistEmailProps) {
  const t = resolveT(props.t);
  return (
    <WaitlistActionEmail
      {...props}
      title={t("systemWaitlistNotification.title")}
      body={t("systemWaitlistNotification.body")}
      action={t("systemWaitlistNotification.action")}
    />
  );
}
