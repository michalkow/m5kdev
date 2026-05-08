import { Button, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function AuthPublicForgotPasswordForm() {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("forgot-password-email") as string;

    setIsBusy(true);
    authClient
      .requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      })
      .then(() => {
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
