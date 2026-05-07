import { Tabs } from "@heroui/react";

import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";

export function AuthAdminLayout({ enableWaitlist }: { enableWaitlist: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const selectedKey = location.pathname.split("/").pop();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <Tabs selectedKey={selectedKey} onSelectionChange={(key) => navigate(`/admin/${key}`)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Options">
            <Tabs.Tab id="users">
              {t("web-ui:auth.admin.users")}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="organizations">
              {t("web-ui:auth.admin.organizations")}
              <Tabs.Indicator />
            </Tabs.Tab>
            {enableWaitlist && (
              <Tabs.Tab id="waitlist">
                {t("web-ui:auth.admin.waitlist")}
                <Tabs.Indicator />
              </Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <Outlet />
    </div>
  );
}
