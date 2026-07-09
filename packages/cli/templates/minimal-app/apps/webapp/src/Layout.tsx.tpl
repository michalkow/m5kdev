import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AppShell } from "@m5kdev/web-ui/modules/app/components/AppShell";
import { AppSidebarContent } from "@m5kdev/web-ui/modules/app/components/AppSidebarContent";
import { AppSidebarHeader } from "@m5kdev/web-ui/modules/app/components/AppSidebarHeader";
import { AppSidebarUser } from "@m5kdev/web-ui/modules/app/components/AppSidebarUser";
import { AuthOrganizationSelect } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationSelect";
import { AuthUtilityImpersonationBanner } from "@m5kdev/web-ui/modules/auth/components/AuthUtilityImpersonationBanner";
import { APP_NAME } from "{{PACKAGE_SCOPE}}/shared/modules/app/app.constants";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PushNotificationsPanel } from "./modules/notification/PushNotificationsPanel";
import { APP_ROUTES, buildNavigationItems } from "./navigation/navigation.config";

export function Layout() {
  const { data: session } = useSession();
  const { t } = useTranslation("blog{{PACKAGE_SCOPE}}");
  const navigate = useNavigate();

  // ephemeral UI state: which collapsible sidebar groups are open
  const [navigationState, setNavigationState] = useState<Record<string, boolean>>({});

  const onSignOut = () => {
    authClient.signOut();
    navigate("/login");
  };

  return (
    <AppShell
      header={<AuthUtilityImpersonationBanner />}
      sidebar={{
        header: <AppSidebarHeader logo={{ src: "/logo.svg", alt: APP_NAME }} title={APP_NAME} />,
        content: (
          <>
            <div className="px-2 group-data-[collapsible=icon]:hidden">
              <AuthOrganizationSelect />
            </div>
            <AppSidebarContent
              navigationItems={buildNavigationItems(t)}
              navigationState={navigationState}
              onNavigationStateChange={setNavigationState}
            />
            <div className="mt-auto px-2 group-data-[collapsible=icon]:hidden">
              <PushNotificationsPanel />
            </div>
          </>
        ),
        footer: (
          <AppSidebarUser
            user={session?.user}
            onSignOut={onSignOut}
            organizationSettingsPath={APP_ROUTES.organization.preferences}
          />
        ),
      }}
    />
  );
}
