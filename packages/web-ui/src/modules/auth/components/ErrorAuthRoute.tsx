import { Card } from "@heroui/react";
import { cn } from "@m5kdev/web-ui/utils";
import { AlertCircle } from "lucide-react";
import { useQueryState } from "nuqs";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function ErrorAuthRoute() {
  const { t } = useTranslation();
  const [error] = useQueryState("error");

  const ErrorEnum = {
    invalid_callback_request: {
      title: "Invalid callback request",
      description: "The callback request is invalid. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    state_not_found: {
      title: "State not found",
      description: "The state was not found. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    account_already_linked_to_different_user: {
      title: "Account already linked to different user",
      description: "The account is already linked to a different user. Please try again.",
      buttons: ["signup"],
      signupLabel: null,
    },
    "email_doesn't_match": {
      title: "Email doesn't match",
      description: "The email doesn't match. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    email_not_found: {
      title: "Email not found",
      description: "The email was not found. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    no_callback_url: {
      title: "No callback URL",
      description: "The callback URL is not set. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    no_code: {
      title: "No code",
      description: "The code is not set. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    oauth_provider_not_found: {
      title: "OAuth provider not found",
      description: "The OAuth provider was not found. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    unable_to_link_account: {
      title: "Unable to link account",
      description: "The account could not be linked. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    unable_to_get_user_info: {
      title: "Unable to get user info",
      description: "The user info could not be retrieved. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    state_mismatch: {
      title: "State mismatch",
      description: "The state mismatch. Please try again.",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
    signup_disabled: {
      title: "Signup disabled",
      description:
        "The signup is disabled while we are in beta. Please join the waitlist to be notified when we launch.",
      buttons: ["signup"],
      signupLabel: "Join the waitlist",
    },
    default: {
      title: "Authentication Failed",
      description: "We encountered an issue with your authentication request",
      buttons: ["login", "signup"],
      signupLabel: null,
    },
  };

  const errorData = ErrorEnum[error as keyof typeof ErrorEnum] || ErrorEnum.default;
  const { title, description, buttons, signupLabel } = errorData;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Header className="text-center flex flex-col gap-2 items-center">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <p className="text-xl font-semibold">{title}</p>
          <p className="text-sm text-default-600">{description}</p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {buttons.includes("login") && (
              <Link
                to="/login"
                className={cn(
                  "inline-flex h-10 w-full items-center justify-center rounded-md border border-default-200",
                  "bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-default-100"
                )}
              >
                {t("web-ui:auth.error.backToLogin")}
              </Link>
            )}
            {buttons.includes("signup") && (
              <Link
                to="/signup"
                className={cn(
                  "inline-flex h-10 w-full items-center justify-center rounded-md border border-default-200",
                  "bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-default-100"
                )}
              >
                {signupLabel || t("web-ui:auth.error.backToSignup")}
              </Link>
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
