import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { BillingProvider } from "@m5kdev/frontend/modules/billing/components/BillingProvider";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AuthOrganizationSelect } from "../../auth/components/AuthOrganizationSelect";
import { AuthUtilityImpersonationBanner } from "../../auth/components/AuthUtilityImpersonationBanner";

interface BillingPaywallProviderProps {
  children: ReactNode;
  loader?: ReactNode;
  planPage: ReactNode;
  skipPlanCheck?: boolean;
}

export function BillingPaywallProvider({
  children,
  loader,
  planPage,
  skipPlanCheck = false,
}: BillingPaywallProviderProps): ReactNode {
  return (
    <BillingProvider
      loader={loader}
      skipPlanCheck={skipPlanCheck}
      planPage={
        <>
          <BillingPaywallChrome />
          {planPage}
        </>
      }
    >
      {children}
    </BillingProvider>
  );
}

function isUserRoleAdmin(user: unknown): boolean {
  if (typeof user !== "object" || user === null || !("role" in user)) {
    return false;
  }
  return user.role === "admin";
}

function BillingPaywallChrome(): ReactNode {
  const { t } = useTranslation("web-ui");
  const { data: session } = useSession();
  const isImpersonating = Boolean(session?.session?.impersonatedBy);
  const showAdminLink = isUserRoleAdmin(session?.user) && !isImpersonating;

  return (
    <div>
      <AuthUtilityImpersonationBanner />
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <AuthOrganizationSelect />
        {showAdminLink ? <Link to="/admin">{t("web-ui:billing.paywall.admin")}</Link> : null}
      </div>
    </div>
  );
}
