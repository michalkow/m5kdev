import { Card, CardBody, CardHeader } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LoginForm } from "./LoginForm";

export function LoginRoute({ providers }: { providers?: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center flex flex-col gap-1">
          <p className="text-xl font-semibold">{t("web-ui:auth.login.welcome")}</p>
          <p className="text-sm text-default-600">
            {providers
              ? t("web-ui:auth.login.descriptionWithProviders")
              : t("web-ui:auth.login.description")}
          </p>
        </CardHeader>
        <CardBody>
          <LoginForm providers={providers} />
        </CardBody>
      </Card>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary  ">
        {t("web-ui:common.byClickingContinue")}{" "}
        <Link to="/terms-of-service">{t("web-ui:common.termsOfService")}</Link>{" "}
        {t("web-ui:common.and")}{" "}
        <Link to="/privacy-policy">{t("web-ui:common.privacyPolicy")}</Link>.
      </div>
    </div>
  );
}
