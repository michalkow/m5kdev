import { Card, CardBody, CardHeader } from "@heroui/react";
import { useQueryState } from "nuqs";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SignupForm } from "./SignupFormRoute";
import type { UseBackendTRPC } from "../../../types";
import { AuthProviders } from "./AuthProviders";
import { WaitlistCard } from "./WaitlistCard";
import { WaitlistCodeValidation } from "./WaitlistCodeValidation";

interface SignupRouteProps {
  providers?: string[];
  useTRPC?: UseBackendTRPC;
}

export function SignupRoute({ providers, useTRPC }: SignupRouteProps) {
  const { t } = useTranslation();

  const [code] = useQueryState("code");
  const [email] = useQueryState("email");

  const hasWaitlist = !!useTRPC;

  return (
    <div className="flex flex-col gap-6">
      {hasWaitlist && !code ? (
        <WaitlistCard useTRPC={useTRPC} />
      ) : (
        <Card>
          <CardHeader className="text-center flex flex-col gap-1">
            <p className="text-xl font-semibold">{t("web-ui:auth.signup.createAccount")}</p>
            <p className="text-sm text-default-600">{t("web-ui:auth.signup.description")}</p>
          </CardHeader>
          <CardBody>
            <div className="grid gap-6">
              {hasWaitlist && code && useTRPC && (
                <WaitlistCodeValidation code={code} useTRPC={useTRPC} />
              )}
              <AuthProviders providers={providers} code={code} requestSignUp />
              <SignupForm code={code} email={email} waitlist={hasWaitlist} />
            </div>
          </CardBody>
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
