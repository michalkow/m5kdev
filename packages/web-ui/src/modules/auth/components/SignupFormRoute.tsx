import { Alert, Button, Input, Label } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type Inputs = {
  email: string;
  password: string;
};

function getEmailProviderUrl(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  const EMAIL_URLS = {
    GMAIL: "https://mail.google.com/mail/u/0/#inbox",
    OUTLOOK: "https://outlook.live.com/mail/0/inbox",
    YAHOO: "https://mail.yahoo.com",
    ICLOUD: "https://www.icloud.com/mail",
    PROTON: "https://mail.proton.me",
  } as const;

  const domainMap: Record<string, string> = {
    "gmail.com": EMAIL_URLS.GMAIL,
    "googlemail.com": EMAIL_URLS.GMAIL,
    "outlook.com": EMAIL_URLS.OUTLOOK,
    "hotmail.com": EMAIL_URLS.OUTLOOK,
    "live.com": EMAIL_URLS.OUTLOOK,
    "msn.com": EMAIL_URLS.OUTLOOK,
    "yahoo.com": EMAIL_URLS.YAHOO,
    "yahoo.co.uk": EMAIL_URLS.YAHOO,
    "yahoo.fr": EMAIL_URLS.YAHOO,
    "ymail.com": EMAIL_URLS.YAHOO,
    "icloud.com": EMAIL_URLS.ICLOUD,
    "me.com": EMAIL_URLS.ICLOUD,
    "mac.com": EMAIL_URLS.ICLOUD,
    "protonmail.com": EMAIL_URLS.PROTON,
    "proton.me": EMAIL_URLS.PROTON,
  };

  return domainMap[domain] || null;
}

export function SignupForm({
  code,
  invitation,
  email,
  waitlist,
}: {
  code?: string | null;
  invitation?: string | null;
  email?: string | null;
  waitlist?: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("start");
  const [userEmail, setUserEmail] = useState<string>(email || "");
  const { registerSession } = useSession();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log(data);
    setStatus("busy");
    setUserEmail(data.email);

    authClient.signUp
      .email(
        {
          name: data.email,
          email: data.email,
          password: data.password,
        },
        {
          headers: {
            "Waitlist-Invitation-Code": code || "",
            "Organization-Invitation-Code": invitation || "",
          },
        }
      )
      .then((result) => {
        console.log(result);
        if (result.error) {
          toast.error(t("web-ui:auth.errors.invitationCodeInvalid"));
          setStatus("start");
          return;
        }
        if (waitlist) {
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
        } else setStatus("done");
      })
      .catch((error) => {
        toast.error(error.message);
        setStatus("start");
      });
  };

  if (status === "done") {
    const emailProviderUrl = userEmail ? getEmailProviderUrl(userEmail) : null;

    return (
      <Alert status="accent">
        <Alert.Title>{t("web-ui:auth.signup.verificationEmailSent.title")}</Alert.Title>
        <Alert.Description>
          <div className="mt-2">
            {t("web-ui:auth.signup.verificationEmailSent.description")}
            {emailProviderUrl && (
              <div className="mt-3">
                <a
                  href={emailProviderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-4 hover:opacity-80 transition-opacity"
                >
                  {t("web-ui:auth.signup.verificationEmailSent.openEmail")}
                </a>
              </div>
            )}
          </div>
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-2">
        <Label className="text-sm font-medium" htmlFor="signup-email">
          {t("web-ui:auth.login.email")}
        </Label>
        <Input
          id="signup-email"
          type="email"
          placeholder={t("web-ui:auth.login.placeholder.email")}
          variant="secondary"
          required
          defaultValue={email ?? ""}
          disabled={!!email}
          {...register("email", { required: true })}
        />
        {errors.email && (
          <span className="text-red-500 text-xs">{t("web-ui:auth.signup.emailRequired")}</span>
        )}
      </div>
      <div className="grid gap-2">
        <Label className="text-sm font-medium" htmlFor="signup-password">
          {t("web-ui:auth.login.password")}
        </Label>
        <Input
          id="signup-password"
          placeholder={t("web-ui:auth.login.password")}
          type="password"
          variant="secondary"
          required
          {...register("password", { required: true })}
        />
        {errors.password && (
          <span className="text-red-500 text-xs">{t("web-ui:auth.signup.passwordRequired")}</span>
        )}
      </div>
      <Button type="submit" className="w-full" variant="primary" isDisabled={status === "busy"}>
        {status === "busy" ? t("web-ui:auth.signup.signingUp") : t("web-ui:auth.signup.button")}
      </Button>
    </form>
  );
}
