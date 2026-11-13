import { toast } from "@heroui/react";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useTranslation } from "react-i18next";
import { createSignInRedirect } from "../utils/signInRedirect";

export function useAuthPublicSignIn({
  returnTo,
  requestSignUp,
  additionalData,
}: {
  returnTo: string;
  requestSignUp: boolean;
  additionalData: Record<string, string>;
}): (provider: "google" | "linkedin" | "microsoft") => Promise<void> {
  const { appUrl } = useAppConfig();
  const authClient = useAuthClient();
  const { data: session, hasSignInHandler } = useSession();
  const { t } = useTranslation();

  return async (provider: "google" | "linkedin" | "microsoft") => {
    const redirect = hasSignInHandler
      ? createSignInRedirect({ appUrl, returnTo, previousSessionId: session?.session.id ?? null })
      : null;
    try {
      const result = await authClient.signIn.social({
        provider,
        requestSignUp,
        additionalData,
        callbackURL: redirect?.callbackURL ?? `${appUrl}${returnTo}`,
      });
      if (result.error) {
        redirect?.clear();
        toast.danger(t("web-ui:auth.errors.invitationCodeInvalid"));
      }
    } catch (error) {
      redirect?.clear();
      toast.danger(t("web-ui:auth.errors.server"), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
}
