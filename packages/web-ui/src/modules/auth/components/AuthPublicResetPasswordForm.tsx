import { Button, ErrorMessage, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { EXPERIENCE_FLOW_HEADER } from "@m5kdev/commons/modules/app/experience.constants";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { parseAsString, useQueryStates } from "nuqs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { createUserLocaleHeaders } from "../utils/authLocale";

export function AuthPublicResetPasswordForm() {
  const authClient = useAuthClient();
  const { t } = useTranslation();
  const { locales } = useAppConfig();
  const [{ token, experienceFlow }] = useQueryStates({
    token: parseAsString,
    experienceFlow: parseAsString,
  });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
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
          headers: {
            ...(locales ? createUserLocaleHeaders(locales) : {}),
            ...(experienceFlow ? { [EXPERIENCE_FLOW_HEADER]: experienceFlow } : {}),
          },
        }
      )
      .then((result) => {
        if (result.error) {
          const message = t(
            result.error.status === 400
              ? "web-ui:auth.resetPassword.linkInvalid"
              : "web-ui:auth.resetPassword.error"
          );
          setError(message);
          toast.error(message);
          return;
        }
        toast.success(t("web-ui:auth.resetPassword.success"));
      })
      .catch(() => {
        toast.error(t("web-ui:auth.resetPassword.error"));
      });
  };

  return (
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
          <Label>{t("web-ui:auth.resetPassword.confirmPassword")}</Label>
          <Input placeholder={t("web-ui:auth.resetPassword.confirmPassword")} />
          <FieldError />
        </TextField>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <Button type="submit" className="w-full" variant="primary">
        {t("web-ui:auth.resetPassword.button")}
      </Button>
    </Form>
  );
}
