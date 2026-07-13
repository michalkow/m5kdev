import type { BackendAppI18nResources } from "@m5kdev/backend/i18n/app-i18n";

export const emailResources = {
  en: {
    translation: {
      verification: {
        subject: "Verify your email",
        previewText: "Verify your email address",
        title: "Verify your email",
        body: "Confirm your email address to finish setting up M5 Starter and access your editorial workspace.",
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
      waitlistConfirmation: {
        subject: "You joined the waitlist",
        previewText: "Your waitlist request was recorded",
        title: "You joined the waitlist",
        body: "Your waitlist request was recorded. We will let you know as soon as a spot opens up.",
        action: "Open app",
      },
      waitlistInvite: {
        subject: "Your invitation is ready",
        previewText: "Create your account",
        title: "Your invitation is ready",
        body: "Use this invitation link to create your account.",
        action: "Create account",
      },
      waitlistUserInvite: {
        subject: "{{inviter}} invited you to join {{brandName}}",
        previewText: "Create your {{brandName}} account today",
        title: "{{inviter}} invited you{{invitee}}",
        body: "This invite lets you skip the waitlist and create your account now.",
        action: "Accept invite",
        inviteeSuffix: " for {{name}}",
      },
      systemWaitlistNotification: {
        subject: "New waitlist signup",
        previewText: "A user joined the waitlist",
        title: "New waitlist signup",
        body: "A user joined the M5 Starter waitlist.",
        action: "Open admin",
      },
    },
  },
} satisfies BackendAppI18nResources;
