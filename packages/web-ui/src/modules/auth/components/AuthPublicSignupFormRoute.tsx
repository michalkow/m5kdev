import { Alert, Button, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

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

export function AuthPublicSignupForm({
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
  const emailLocked = !!email;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submittedEmail = formData.get("signup-email") as string;
    const password = formData.get("signup-password") as string;

    setStatus("busy");
    setUserEmail(submittedEmail);

    authClient.signUp
      .email(
        {
          name: submittedEmail,
          email: submittedEmail,
          password,
        },
        {
          headers: {
            "Waitlist-Invitation-Code": code || "",
            "Organization-Invitation-Code": invitation || "",
          },
        }
      )
      .then((result) => {
        if (result.error) {
          toast.danger(result.error.message);
          setStatus("start");
          return;
        }
        if (waitlist || invitation) {
          authClient.signIn
            .email({
              email: submittedEmail,
              password,
            })
            .then((res) => {
              if (res.data?.user) {
                registerSession(() => {
                  navigate("/");
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
        } else setStatus("done");
      })
      .catch((error: Error) => {
        toast.danger(error.message);
        setStatus("start");
      });
  };

  if (status === "done") {
    const emailProviderUrl = userEmail ? getEmailProviderUrl(userEmail) : null;

    return (
      <Alert status="success" className="surface surface--secondary">
        <Alert.Indicator />
        <Alert.Content>
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
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <Form onSubmit={onSubmit} className="grid gap-6">
      <div className="grid gap-2">
        <TextField
          isRequired
          name="signup-email"
          type="email"
          variant="secondary"
          defaultValue={email ?? ""}
          isReadOnly={emailLocked}
          autoComplete="email"
        >
          <Label className="text-sm font-medium">{t("web-ui:auth.login.email")}</Label>
          <Input placeholder={t("web-ui:auth.login.placeholder.email")} />
          <FieldError />
        </TextField>
      </div>
      <div className="grid gap-2">
        <TextField
          isRequired
          name="signup-password"
          type="password"
          variant="secondary"
          autoComplete="new-password"
          minLength={8}
        >
          <Label className="text-sm font-medium">{t("web-ui:auth.login.password")}</Label>
          <Input placeholder={t("web-ui:auth.login.password")} />
          <FieldError />
        </TextField>
      </div>
      <Button type="submit" className="w-full" variant="primary" isDisabled={status === "busy"}>
        {status === "busy" ? t("web-ui:auth.signup.signingUp") : t("web-ui:auth.signup.button")}
      </Button>
    </Form>
  );
}
