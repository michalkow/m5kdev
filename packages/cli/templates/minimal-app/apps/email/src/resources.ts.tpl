import type { BackendAppI18nResources } from "@m5kdev/backend/i18n/app-i18n";

export const emailResources = {
  en: {
    translation: {
      verification: {
        subject: "Verify your email",
        previewText: "Verify your email address",
        title: "Verify your email",
        body: "Confirm your email address to finish setting up {{APP_NAME}} and access your editorial workspace.",
        action: "Verify account",
      },
      passwordReset: {
        subject: "Reset your password",
        previewText: "Reset your password request",
        title: "Reset your password",
        body: "Use this link to choose a new password for your account.",
        action: "Reset password",
      },
      accountDeletion: {
        subject: "Delete your account",
        previewText: "Confirm your account deletion",
        title: "Confirm account deletion",
        body: "Use this link to confirm deleting your account.",
        action: "Confirm deletion",
      },
      organizationInvite: {
        subject: "Join the organization",
        previewText: "You have been invited to join an organization",
        title: "Join {{organizationName}}",
        body: "{{inviterName}} invited you to join {{organizationName}} as {{role}}.",
        action: "Accept invitation",
      },
    },
  },
} satisfies BackendAppI18nResources;
