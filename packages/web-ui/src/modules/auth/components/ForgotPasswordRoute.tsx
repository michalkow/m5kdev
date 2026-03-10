import { Card, CardBody, CardHeader } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ForgotPasswordForm } from "#modules/auth/components/ForgotPasswordForm";

export function ForgotPasswordRoute() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center flex flex-col gap-1">
          <p className="text-xl font-semibold">{t("web-ui:auth.forgotPassword.title")}</p>
          <p className="text-sm text-default-600">{t("web-ui:auth.forgotPassword.description")}</p>
        </CardHeader>
        <CardBody>
          <ForgotPasswordForm />
        </CardBody>
      </Card>
      <div className="text-center text-xs text-muted-foreground">
        {t("web-ui:auth.forgotPassword.rememberPassword")}{" "}
        <Link to="/login" className="underline underline-offset-4 hover:text-primary">
          {t("web-ui:auth.login.button")}
        </Link>
      </div>
    </div>
  );
}
