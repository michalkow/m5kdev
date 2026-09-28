import { Tabs } from "@heroui/react";

import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import type { AuthAdminExtraLink } from "../types";

export function AuthAdminLayout({
  enableWaitlist,
  extraLinks = [],
}: {
  enableWaitlist: boolean;
  extraLinks?: readonly AuthAdminExtraLink[];
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const selectedKey = location.pathname.split("/").pop();
  const navigate = useNavigate();
  return (
    <div className="container py-4 px-4">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-4">
        <Tabs
          selectedKey={selectedKey}
          onSelectionChange={(key) => navigate(`/admin/${key}`)}
          className="w-full max-w-md"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label={t("web-ui:auth.admin.tabs")}>
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
        {extraLinks.length > 0 ? (
          <nav aria-label={t("web-ui:auth.admin.moduleLinks")} className="flex flex-wrap gap-2">
            {extraLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-primary hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <Outlet />
    </div>
  );
}
