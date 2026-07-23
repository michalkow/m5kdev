import type { FunctionComponent } from "react";
import AccountDeletionEmail from "./emails/accountDeletionEmail";
import OrganizationInviteEmail from "./emails/organizationInviteEmail";
import PasswordResetEmail from "./emails/passwordResetEmail";
import VerificationEmail from "./emails/verificationEmail";
import {
  SystemWaitlistNotificationEmail,
  WaitlistConfirmationEmail,
  WaitlistInviteEmail,
  WaitlistUserInviteEmail,
} from "./emails/waitlistEmails";

/**
 * EmailService renders templates with untyped props (they come from send-time
 * data), so the registry erases each template's prop type. The props each
 * template receives are guaranteed by the corresponding EmailService.send*
 * method.
 */
function asTemplate(
  component: FunctionComponent<never>
): FunctionComponent<Record<string, unknown>> {
  return component as unknown as FunctionComponent<Record<string, unknown>>;
}

export const templates = {
  accountDeletion: {
    id: "account-deletion",
    subject: "accountDeletion.subject",
    previewText: "accountDeletion.previewText",
    react: asTemplate(AccountDeletionEmail),
  },
  passwordReset: {
    id: "password-reset",
    subject: "passwordReset.subject",
    previewText: "passwordReset.previewText",
    react: asTemplate(PasswordResetEmail),
  },
  verification: {
    id: "verification",
    subject: "verification.subject",
    previewText: "verification.previewText",
    react: asTemplate(VerificationEmail),
  },
  organizationInvite: {
    id: "organization-invite",
    subject: "organizationInvite.subject",
    previewText: "organizationInvite.previewText",
    react: asTemplate(OrganizationInviteEmail),
  },
  waitlistConfirmation: {
    id: "waitlist-confirmation",
    subject: "waitlistConfirmation.subject",
    previewText: "waitlistConfirmation.previewText",
    react: asTemplate(WaitlistConfirmationEmail),
  },
  waitlistInvite: {
    id: "waitlist-invite",
    subject: "waitlistInvite.subject",
    previewText: "waitlistInvite.previewText",
    react: asTemplate(WaitlistInviteEmail),
  },
  waitlistUserInvite: {
    id: "waitlist-user-invite",
    subject: "waitlistUserInvite.subject",
    previewText: "waitlistUserInvite.previewText",
    react: asTemplate(WaitlistUserInviteEmail),
  },
  systemWaitlistNotification: {
    id: "system-waitlist-notification",
    subject: "systemWaitlistNotification.subject",
    previewText: "systemWaitlistNotification.previewText",
    react: asTemplate(SystemWaitlistNotificationEmail),
  },
};
