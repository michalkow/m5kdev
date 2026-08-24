import { Button, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { AuthPublicLastUsedBadge } from "./AuthPublicLastUsedBadge";
import { AuthPublicProviders } from "./AuthPublicProviders";

export function AuthPublicLoginForm({ providers }: { providers?: string[] }) {
  const lastMethod = authClient.getLastUsedLoginMethod();
  const { registerSession } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const returnToPath = searchParams.get("returnTo");
  const returnTo =
    !returnToPath?.startsWith("//") && returnToPath?.startsWith("/") ? returnToPath : undefined;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("login-email") as string;
    const password = formData.get("login-password") as string;

    authClient.signIn
      .email({
        email,
        password,
      })
      .then((res) => {
        if (res.data?.user) {
          registerSession(() => {
            navigate(returnTo ?? "/");
          });
        } else if (res.error) {
          toast.danger(t("web-ui:auth.errors.authentication"), {
            description: res.error.message,
          });
        }
      })
      .catch((error: Error) => {
        toast.danger(t("web-ui:auth.errors.server"), {
          description: error.message,
        });
      });
  };

  return (
    <Form onSubmit={onSubmit} className="grid gap-6">
      <div className="grid gap-6">
        <AuthPublicProviders providers={providers} lastMethod={lastMethod} returnTo={returnTo} />

        <div className="grid gap-6">
          <div className="grid gap-2">
            <TextField
              isRequired
              name="login-email"
              type="email"
              variant="secondary"
              autoComplete="email"
            >
              <AuthPublicLastUsedBadge lastMethod={lastMethod} method="email">
                <Label>{t("web-ui:auth.login.email")}</Label>
              </AuthPublicLastUsedBadge>
              <Input placeholder={t("web-ui:auth.login.placeholder.email")} />
              <FieldError />
            </TextField>
          </div>

          <div className="grid gap-2">
            <TextField
              isRequired
              name="login-password"
              type="password"
              variant="secondary"
              autoComplete="current-password"
            >
              <div className="flex w-full items-center">
                <Label>{t("web-ui:auth.login.password")}</Label>
                <Link
                  to="/forgot-password"
                  className="ml-auto text-sm underline-offset-4 hover:underline"
                >
                  {t("web-ui:auth.login.forgotPassword")}
                </Link>
              </div>
              <Input placeholder={t("web-ui:auth.login.password")} />
              <FieldError />
            </TextField>
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
    </Form>
  );
}
