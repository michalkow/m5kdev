import type { FunctionComponent } from "react";
import AccountDeletionEmail from "./emails/accountDeletionEmail";
import OrganizationInviteEmail from "./emails/organizationInviteEmail";
import PasswordResetEmail from "./emails/passwordResetEmail";
import VerificationEmail from "./emails/verificationEmail";

export const templates = {
  accountDeletion: {
    id: "account-deletion",
    subject: "accountDeletion.subject",
    previewText: "accountDeletion.previewText",
    react: AccountDeletionEmail as FunctionComponent<Record<string, unknown>>,
  },
  passwordReset: {
    id: "password-reset",
    subject: "passwordReset.subject",
    previewText: "passwordReset.previewText",
    react: PasswordResetEmail as FunctionComponent<Record<string, unknown>>,
  },
  verification: {
    id: "verification",
    subject: "verification.subject",
    previewText: "verification.previewText",
    react: VerificationEmail as FunctionComponent<Record<string, unknown>>,
  },
  organizationInvite: {
    id: "organization-invite",
    subject: "organizationInvite.subject",
    previewText: "organizationInvite.previewText",
    react: OrganizationInviteEmail as FunctionComponent<Record<string, unknown>>,
  },
};
