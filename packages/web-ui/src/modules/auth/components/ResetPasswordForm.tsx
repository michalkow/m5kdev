import { Button, Card, Input, Label } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

type Inputs = {
  password: string;
  confirmPassword: string;
};

export function ResetPasswordForm() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Inputs>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    if (data.password !== data.confirmPassword) {
      setError("confirmPassword", { message: t("web-ui:auth.resetPassword.passwordMismatch") });
      return;
    }

    if (!token) {
      throw new Error(t("web-ui:auth.resetPassword.tokenRequired"));
    }

    authClient
      .resetPassword({
        newPassword: data.password,
        token,
      })
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
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
            <div className="grid gap-2">
              <Label className="text-sm font-medium" htmlFor="reset-password-new">
                {t("web-ui:auth.resetPassword.newPassword")}
              </Label>
              <Input
                id="reset-password-new"
                placeholder={t("web-ui:auth.resetPassword.newPassword")}
                type="password"
                variant="secondary"
                required
                {...register("password", {
                  required: t("web-ui:auth.resetPassword.passwordRequired"),
                })}
              />
              {errors.password && (
                <span className="text-red-500 text-xs">{errors.password.message}</span>
              )}
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium" htmlFor="reset-password-confirm">
                {t("web-ui:auth.resetPassword.confirmPassword")}
              </Label>
              <Input
                id="reset-password-confirm"
                placeholder={t("web-ui:auth.resetPassword.confirmPassword")}
                type="password"
                variant="secondary"
                required
                {...register("confirmPassword", {
                  required: t("web-ui:auth.resetPassword.confirmPasswordRequired"),
                })}
              />
              {errors.confirmPassword && (
                <span className="text-red-500 text-xs">{errors.confirmPassword.message}</span>
              )}
            </div>
            <Button type="submit" className="w-full" variant="primary">
              {t("web-ui:auth.resetPassword.button")}
            </Button>
          </form>
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
