import { Button, Input } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { AuthProviders } from "./AuthProviders";
import { LastUsedBadge } from "./LastUsedBadge";

type Inputs = {
  email: string;
  password: string;
};

export function LoginForm({ providers }: { providers?: string[] }) {
  const lastMethod = authClient.getLastUsedLoginMethod();
  const { register, handleSubmit } = useForm<Inputs>();
  const { registerSession } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log(data);
    authClient.signIn
      .email({
        email: data.email,
        password: data.password,
      })
      .then((res) => {
        console.log(res);
        if (res.data?.user) {
          registerSession(() => {
            navigate("/");
          });
        } else if (res.error) {
          toast.error(t("web-ui:auth.errors.authentication"), {
            description: res.error.message,
          });
        }
      })
      .catch((error) => {
        toast.error(t("web-ui:auth.errors.server"), {
          description: error.message,
        });
      });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-6">
        <AuthProviders providers={providers} lastMethod={lastMethod} />

        <div className="grid gap-6">
          <div className="grid gap-2">
            <LastUsedBadge lastMethod={lastMethod} method="email">
              <label htmlFor="email" className="text-sm font-medium">
                {t("web-ui:auth.login.email")}
              </label>
            </LastUsedBadge>
            <Input
              type="email"
              placeholder={t("web-ui:auth.login.placeholder.email")}
              variant="secondary"
              required
              {...register("email", { required: true })}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center">
              <label htmlFor="password" className="text-sm font-medium">
                {t("web-ui:auth.login.password")}
              </label>
              <Link
                to="/forgot-password"
                className="ml-auto text-sm underline-offset-4 hover:underline"
              >
                {t("web-ui:auth.login.forgotPassword")}
              </Link>
            </div>
            <Input
              placeholder={t("web-ui:auth.login.password")}
              type="password"
              variant="secondary"
              required
              {...register("password", { required: true })}
            />
          </div>
          <Button type="submit" className="w-full" variant="primary">
            {t("web-ui:auth.login.button")}
          </Button>
        </div>

        <div className="text-center text-sm">
          {t("web-ui:auth.login.noAccount")}{" "}
          <Link to="/signup" className="underline underline-offset-4">
            {t("web-ui:auth.login.signUp")}
          </Link>
        </div>
      </div>
    </form>
  );
}
