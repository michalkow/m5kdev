import { Button } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GoogleIcon } from "#icons/GoogleIcon";
import { LinkedInIcon } from "#icons/LinkedInIcon";
import { MicrosoftIcon } from "#icons/MicrosoftIcon";
import { LastUsedBadge } from "./LastUsedBadge";

export function AuthProviders({
  providers,
  lastMethod,
  code,
  requestSignUp = false,
}: {
  providers?: string[];
  code?: string | null;
  requestSignUp?: boolean;
  lastMethod?: string | null;
}) {
  const { t } = useTranslation();
  if (!providers || providers.length === 0) return null;
  const additionalData = code ? { waitlistInvitationCode: code } : {};

  const handleSignIn = (result: any) => {
    if (result.error) {
      toast.error(t("web-ui:auth.errors.invitationCodeInvalid"));
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {providers.includes("google") && (
          <LastUsedBadge lastMethod={lastMethod} method="google">
            <Button
              type="button"
              variant="bordered"
              className="w-full gap-2"
              onPress={() => {
                authClient.signIn
                  .social({
                    provider: "google",
                    requestSignUp,
                    additionalData,
                  })
                  .then(handleSignIn);
              }}
            >
              <GoogleIcon className="h-5 w-5" />
              {t("web-ui:auth.login.google")}
            </Button>
          </LastUsedBadge>
        )}
        {providers.includes("linkedin") && (
          <LastUsedBadge lastMethod={lastMethod} method="linkedin">
            <Button
              type="button"
              variant="bordered"
              className="w-full"
              onPress={() => {
                authClient.signIn
                  .social({
                    provider: "linkedin",
                    requestSignUp,
                    additionalData,
                  })
                  .then(handleSignIn);
              }}
            >
              <LinkedInIcon className="h-5 w-5" />
              {t("web-ui:auth.login.linkedin")}
            </Button>
          </LastUsedBadge>
        )}
        {providers.includes("microsoft") && (
          <LastUsedBadge lastMethod={lastMethod} method="microsoft">
            <Button
              type="button"
              variant="bordered"
              className="w-full"
              onPress={() => {
                authClient.signIn
                  .social({
                    provider: "microsoft",
                    requestSignUp,
                    additionalData,
                  })
                  .then(handleSignIn);
              }}
            >
              <MicrosoftIcon className="h-5 w-5" />
              {t("web-ui:auth.login.microsoft")}
            </Button>
          </LastUsedBadge>
        )}
      </div>
      <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
        <span className="relative z-10 bg-background px-2 text-muted-foreground">
          {t("web-ui:auth.login.orContinueWith")}
        </span>
      </div>
    </>
  );
}
