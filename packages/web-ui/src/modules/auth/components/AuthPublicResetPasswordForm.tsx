import {
  Button,
  Card,
  ErrorMessage,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { createUserLocaleHeaders } from "../utils/authLocale";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

export function AuthPublicResetPasswordForm() {
  const { t } = useTranslation();
  const { locales } = useAppConfig();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const token = searchParams.get("token");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("reset-password-new") as string;
    const confirmPassword = formData.get("reset-password-confirm") as string;

    setError(null);

    if (!token) {
      setError(t("web-ui:auth.resetPassword.tokenRequired"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("web-ui:auth.resetPassword.passwordMismatch"));
      return;
    }

    authClient
      .resetPassword(
        {
          newPassword,
          token,
        },
        {
          headers: locales ? createUserLocaleHeaders(locales) : {},
        }
      )
      .then(() => {
        toast.success(t("web-ui:auth.resetPassword.success"));
        // Optionally, redirect
      })
      .catch(() => {
        toast.error(t("web-ui:auth.resetPassword.error"));
      });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Header className="text-center flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{t("web-ui:auth.resetPassword.title")}</h2>
          <p className="text-sm text-default-600">{t("web-ui:auth.resetPassword.description")}</p>
        </Card.Header>
        <Card.Content className="gap-6">
          <Form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-2">
              <TextField
                isRequired
                name="reset-password-new"
                type="password"
                variant="secondary"
                minLength={8}
              >
                <Label>{t("web-ui:auth.resetPassword.newPassword")}</Label>
                <Input placeholder={t("web-ui:auth.resetPassword.newPassword")} />
                <FieldError />
              </TextField>
            </div>
            <div className="grid gap-2">
              <TextField
                isRequired
                name="reset-password-confirm"
                type="password"
                variant="secondary"
                minLength={8}
              >
                <Label> {t("web-ui:auth.resetPassword.confirmPassword")}</Label>
                <Input placeholder={t("web-ui:auth.resetPassword.confirmPassword")} />
                <FieldError />
              </TextField>
            </div>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <Button type="submit" className="w-full" variant="primary">
              {t("web-ui:auth.resetPassword.button")}
            </Button>
          </Form>
        </Card.Content>
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
