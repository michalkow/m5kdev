import { Spinner } from "@heroui/react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useAuthPublicSignInCallback } from "../hooks/useAuthPublicSignInCallback";

export function AuthPublicSignInCallbackRoute(): ReactElement {
  const { t } = useTranslation();
  useAuthPublicSignInCallback();
  return <Spinner aria-label={t("web-ui:common.loading")} />;
}
