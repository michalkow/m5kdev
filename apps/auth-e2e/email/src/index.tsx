import type { EmailTemplates } from "@m5kdev/backend/modules/email/email.service";
import type { FunctionComponent, ReactNode } from "react";

type Brand = {
  name?: string;
  logo?: string;
  tagline?: string;
};

type BaseEmailProps = {
  brand?: Brand;
  previewText?: string;
  url?: string;
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

function brandName(brand?: Brand) {
  return brand?.name ?? "Auth E2E Blog";
}

function emailBrand(brand?: Brand) {
  return {
    name: brandName(brand),
    logo: brand?.logo ?? "",
    tagline: brand?.tagline ?? "Authentication test workspace",
  };
}

function EmailShell({
  brand,
  previewText,
  children,
}: BaseEmailProps & {
  children: ReactNode;
}) {
  const resolvedBrand = emailBrand(brand);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{previewText ?? resolvedBrand.name}</title>
      </head>
      <body
        style={{
          margin: 0,
          background: "#f7f7f4",
          color: "#1f2933",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "none", opacity: 0, overflow: "hidden" }}>{previewText}</div>
        <main
          style={{
            maxWidth: 640,
            margin: "0 auto",
            padding: "32px 20px",
          }}
        >
          <p style={{ color: "#52606d", fontSize: 13, margin: "0 0 12px" }}>{resolvedBrand.name}</p>
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #d9e2ec",
              borderRadius: 8,
              padding: 28,
            }}
          >
            {children}
          </section>
          <p style={{ color: "#7b8794", fontSize: 12, margin: "18px 0 0" }}>
            {resolvedBrand.tagline}
          </p>
        </main>
      </body>
    </html>
  );
}

function ActionEmail({
  brand,
  previewText,
  url,
  title,
  body,
  action,
}: BaseEmailProps & {
  title: string;
  body: string;
  action: string;
}) {
  return (
    <EmailShell brand={brand} previewText={previewText ?? title}>
      <h1 style={{ fontSize: 28, lineHeight: "34px", margin: "0 0 12px" }}>{title}</h1>
      <p style={{ fontSize: 16, lineHeight: "24px", margin: "0 0 22px" }}>{body}</p>
      {url && (
        <a
          href={url}
          style={{
            display: "inline-block",
            background: "#0f766e",
            borderRadius: 6,
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 700,
            padding: "12px 18px",
            textDecoration: "none",
          }}
        >
          {action}
        </a>
      )}
    </EmailShell>
  );
}

const VerificationEmail: FunctionComponent<Record<string, unknown>> = (props) => (
  <ActionEmail
    {...(props as BaseEmailProps)}
    title="Verify your email"
    body="Confirm this email address to finish creating your account."
    action="Verify account"
  />
);

const PasswordResetEmail: FunctionComponent<Record<string, unknown>> = (props) => (
  <ActionEmail
    {...(props as BaseEmailProps)}
    title="Reset your password"
    body="Use this link to choose a new password for your account."
    action="Reset password"
  />
);

const AccountDeletionEmail: FunctionComponent<Record<string, unknown>> = (props) => (
  <ActionEmail
    {...(props as BaseEmailProps)}
    title="Confirm account deletion"
    body="Use this link to confirm deleting your account."
    action="Confirm deletion"
  />
);

const WaitlistConfirmationEmail: FunctionComponent<Record<string, unknown>> = (props) => (
  <ActionEmail
    {...(props as BaseEmailProps)}
    title="You joined the waitlist"
    body="Your waitlist request was recorded."
    action="Open app"
  />
);

const WaitlistInviteEmail: FunctionComponent<Record<string, unknown>> = (props) => (
  <ActionEmail
    {...(props as BaseEmailProps)}
    title="Your invitation is ready"
    body="Use this invitation link to create your account."
    action="Create account"
  />
);

const WaitlistUserInviteEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as WaitlistInviteProps;
  const inviter = emailProps.inviter ?? "A teammate";
  const invitee = emailProps.name ? ` for ${emailProps.name}` : "";
  return (
    <ActionEmail
      {...emailProps}
      title={`${inviter} invited you${invitee}`}
      body="This invite lets you skip the waitlist and create your account now."
      action="Accept invite"
    />
  );
};

const SystemWaitlistNotificationEmail: FunctionComponent<Record<string, unknown>> = (props) => (
  <ActionEmail
    {...(props as BaseEmailProps)}
    title="New waitlist signup"
    body="A user joined the auth E2E waitlist."
    action="Open admin"
  />
);

const OrganizationInviteEmail: FunctionComponent<Record<string, unknown>> = (props) => {
  const emailProps = props as OrganizationInviteProps;
  const organization = emailProps.organizationName ?? "an organization";
  const inviter = emailProps.inviterName ?? "A teammate";
  const role = emailProps.role ?? "member";

  return (
    <EmailShell
      brand={emailProps.brand}
      previewText={emailProps.previewText ?? `${inviter} invited you to ${organization}`}
    >
      <h1 style={{ fontSize: 28, lineHeight: "34px", margin: "0 0 12px" }}>
        {inviter} invited you to {organization}
      </h1>
      <p style={{ fontSize: 16, lineHeight: "24px", margin: "0 0 22px" }}>
        You have been invited as {role}. Create an account or sign in to accept.
      </p>
      {emailProps.url && (
        <a
          href={emailProps.url}
          style={{
            display: "inline-block",
            background: "#0f766e",
            borderRadius: 6,
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 700,
            padding: "12px 18px",
            textDecoration: "none",
          }}
        >
          Accept organization invite
        </a>
      )}
    </EmailShell>
  );
};

export const templates = {
  accountDeletion: {
    id: "account-deletion",
    subject: "Delete your account",
    previewText: "Confirm your account deletion",
    react: AccountDeletionEmail,
  },
  verification: {
    id: "verification",
    subject: "Verify your email",
    previewText: "Verify your email address",
    react: VerificationEmail,
  },
  waitlistConfirmation: {
    id: "waitlist-confirmation",
    subject: "You joined the waitlist",
    previewText: "Your waitlist request was recorded",
    react: WaitlistConfirmationEmail,
  },
  passwordReset: {
    id: "password-reset",
    subject: "Reset your password",
    previewText: "Reset your password request",
    react: PasswordResetEmail,
  },
  systemWaitlistNotification: {
    id: "system-waitlist-notification",
    subject: "New waitlist signup",
    previewText: "A user joined the waitlist",
    react: SystemWaitlistNotificationEmail,
  },
  waitlistInvite: {
    id: "waitlist-invite",
    subject: "Your invitation is ready",
    previewText: "Create your account",
    react: WaitlistInviteEmail,
  },
  waitlistUserInvite: {
    id: "waitlist-user-invite",
    subject: "You were invited",
    previewText: "Skip the waitlist",
    react: WaitlistUserInviteEmail,
  },
  organizationInvite: {
    id: "organization-invite",
    subject: "Join the organization",
    previewText: "You have been invited to join an organization",
    react: OrganizationInviteEmail,
  },
} satisfies EmailTemplates;
