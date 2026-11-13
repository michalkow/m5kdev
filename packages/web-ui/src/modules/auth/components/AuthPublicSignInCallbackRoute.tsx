import { Spinner } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useAuthPublicSignInCallback } from "../hooks/useAuthPublicSignInCallback";

export function AuthPublicSignInCallbackRoute() {
  const { t } = useTranslation();
  useAuthPublicSignInCallback();
  return <Spinner aria-label={t("web-ui:common.loading")} />;
}
