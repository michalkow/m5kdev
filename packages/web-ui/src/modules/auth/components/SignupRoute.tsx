import { Card } from "@heroui/react";
import { useQueryState } from "nuqs";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AuthProviders } from "./AuthProviders";
import { SignupForm } from "./SignupFormRoute";
import { WaitlistCard } from "./WaitlistCard";
import { WaitlistCodeValidation } from "./WaitlistCodeValidation";

interface SignupRouteProps {
  providers?: string[];
  waitlist?: boolean;
}

export function SignupRoute({ providers, waitlist = false }: SignupRouteProps) {
  const { t } = useTranslation();

  const [code] = useQueryState("code");
  const [invitation] = useQueryState("invitation");
  const [email] = useQueryState("email");

  const hasWaitlist = waitlist;

  return (
    <div className="flex flex-col gap-6">
      {hasWaitlist && !code ? (
        <WaitlistCard />
      ) : (
        <Card>
          <Card.Header className="text-center flex flex-col gap-1">
            <p className="text-xl font-semibold">{t("web-ui:auth.signup.createAccount")}</p>
            <p className="text-sm text-default-600">{t("web-ui:auth.signup.description")}</p>
          </Card.Header>
          <Card.Content>
            <div className="grid gap-6">
              {hasWaitlist && code && <WaitlistCodeValidation code={code} />}
              <AuthProviders
                providers={providers}
                code={code}
                invitation={invitation}
                requestSignUp
              />
              <SignupForm
                code={code}
                invitation={invitation}
                email={email}
                waitlist={hasWaitlist}
              />
            </div>
          </Card.Content>
        </Card>
      )}
      <div className="text-center text-xs text-muted-foreground">
        {t("web-ui:auth.signup.alreadyHaveAccount")}{" "}
        <Link to="/login" className="underline underline-offset-4 hover:text-primary">
          {t("web-ui:auth.login.button")}
        </Link>
      </div>
    </div>
  );
}
