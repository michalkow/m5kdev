import type { FunctionComponent } from "react";
import AccountDeletionEmail from "./emails/accountDeletionEmail";
import OrganizationInviteEmail from "./emails/organizationInviteEmail";
import PasswordResetEmail from "./emails/passwordResetEmail";
import VerificationEmail from "./emails/verificationEmail";

export const templates = {
  accountDeletion: {
    id: "account-deletion",
    subject: "Delete your account",
    previewText: "Confirm your account deletion",
    react: AccountDeletionEmail as FunctionComponent<Record<string, unknown>>,
  },
  passwordReset: {
    id: "password-reset",
    subject: "Reset your password",
    previewText: "Reset your password request",
    react: PasswordResetEmail as FunctionComponent<Record<string, unknown>>,
  },
  verification: {
    id: "verification",
    subject: "Verify your email",
    previewText: "Verify your email address",
    react: VerificationEmail as FunctionComponent<Record<string, unknown>>,
  },
  organizationInvite: {
    id: "organization-invite",
    subject: "Join the organization",
    previewText: "You have been invited to join an organization",
    react: OrganizationInviteEmail as FunctionComponent<Record<string, unknown>>,
  },
};
