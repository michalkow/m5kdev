import { Button, Input, Label } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Inputs = {
  email: string;
};

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();

  const [isBusy, setIsBusy] = useState(false);

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    setIsBusy(true);
    authClient
      .requestPasswordReset({
        email: data.email,
        redirectTo: "/reset-password",
      })
      .then(() => {
        toast.success(t("web-ui:auth.forgotPassword.success"));
      })
      .catch(() => {
        toast.error(t("web-ui:auth.forgotPassword.error"));
      });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label className="text-sm font-medium" htmlFor="forgot-password-email">
          {t("web-ui:auth.login.email")}
        </Label>
        <Input
          id="forgot-password-email"
          type="email"
          placeholder={t("web-ui:auth.login.placeholder.email")}
          variant="secondary"
          required
          {...register("email", { required: true })}
        />
        {errors.email && (
          <span className="text-red-500 text-xs">{t("web-ui:auth.signup.emailRequired")}</span>
        )}
      </div>
      <Button type="submit" className="w-full" variant="primary" isDisabled={isBusy}>
        {t("web-ui:auth.forgotPassword.button")}
      </Button>
    </form>
  );
}
