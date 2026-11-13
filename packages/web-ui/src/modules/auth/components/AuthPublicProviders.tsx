import { Button } from "@heroui/react";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useTranslation } from "react-i18next";
import { GoogleIcon } from "../../../icons/GoogleIcon";
import { LinkedInIcon } from "../../../icons/LinkedInIcon";
import { MicrosoftIcon } from "../../../icons/MicrosoftIcon";
import { useAuthPublicSignIn } from "../hooks/useAuthPublicSignIn";
import { resolvePublicLocale } from "../utils/authLocale";
import { AuthPublicLastUsedBadge } from "./AuthPublicLastUsedBadge";

export function AuthPublicProviders({
  providers,
  lastMethod,
  code,
  invitation,
  requestSignUp = false,
  returnTo = "/",
  trialPriceId,
}: {
  providers?: string[];
  code?: string | null;
  requestSignUp?: boolean;
  lastMethod?: string | null;
  returnTo?: string;
  invitation?: string | null;
  trialPriceId?: string | null;
}) {
  const { t } = useTranslation();
  const { locales } = useAppConfig();
  const additionalData = {
    ...(code ? { waitlistInvitationCode: code } : {}),
    ...(invitation ? { organizationInvitationCode: invitation } : {}),
    ...(locales ? { userLocale: resolvePublicLocale(locales) } : {}),
    ...(trialPriceId ? { userPriceId: trialPriceId } : {}),
  };

  const signIn = useAuthPublicSignIn({ returnTo, requestSignUp, additionalData });
  if (!providers || providers.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-4">
        {providers.includes("google") && (
          <AuthPublicLastUsedBadge lastMethod={lastMethod} method="google">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onPress={() => {
                void signIn("google");
              }}
            >
              <GoogleIcon className="h-5 w-5" />
              {t("web-ui:auth.login.google")}
            </Button>
          </AuthPublicLastUsedBadge>
        )}
        {providers.includes("linkedin") && (
          <AuthPublicLastUsedBadge lastMethod={lastMethod} method="linkedin">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onPress={() => {
                void signIn("linkedin");
              }}
            >
              <LinkedInIcon className="h-5 w-5" />
              {t("web-ui:auth.login.linkedin")}
            </Button>
          </AuthPublicLastUsedBadge>
        )}
        {providers.includes("microsoft") && (
          <AuthPublicLastUsedBadge lastMethod={lastMethod} method="microsoft">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onPress={() => {
                void signIn("microsoft");
              }}
            >
              <MicrosoftIcon className="h-5 w-5" />
              {t("web-ui:auth.login.microsoft")}
            </Button>
          </AuthPublicLastUsedBadge>
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
