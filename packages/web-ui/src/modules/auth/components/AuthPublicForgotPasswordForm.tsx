import { Button, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createUserLocaleHeaders } from "../utils/authLocale";

export function AuthPublicForgotPasswordForm() {
  const authClient = useAuthClient();
  const { t } = useTranslation();
  const { locales, appUrl } = useAppConfig();
  const [isBusy, setIsBusy] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("forgot-password-email") as string;

    setIsBusy(true);
    authClient
      .requestPasswordReset(
        {
          email,
          redirectTo: new URL("/reset-password", appUrl).href,
        },
        {
          headers: locales ? createUserLocaleHeaders(locales) : {},
        }
      )
      .then((result) => {
        if (result.error) {
          toast.danger(t("web-ui:auth.forgotPassword.error"));
          return;
        }
        toast.success(t("web-ui:auth.forgotPassword.success"));
      })
      .catch(() => {
        toast.danger(t("web-ui:auth.forgotPassword.error"));
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <Form onSubmit={onSubmit} className="grid gap-6">
      <div className="grid gap-2">
        <TextField
          isRequired
          name="forgot-password-email"
          type="email"
          variant="secondary"
          autoComplete="email"
        >
          <Label className="text-sm font-medium">{t("web-ui:auth.login.email")}</Label>
          <Input placeholder={t("web-ui:auth.login.placeholder.email")} />
          <FieldError />
        </TextField>
      </div>
      <Button type="submit" className="w-full" variant="primary" isDisabled={isBusy}>
        {t("web-ui:auth.forgotPassword.button")}
      </Button>
    </Form>
  );
}
