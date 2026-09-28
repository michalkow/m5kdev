import type { ReactNode } from "react";
import { Route } from "react-router";
import type { AuthAdminExtraLink } from "../types";
import { AuthAdminLayout } from "./AuthAdminLayout";
import { AuthAdminOrganizationManagement } from "./AuthAdminOrganizationManagement";
import {
  AuthAdminUserManagement,
  type AuthAdminUserManagementProps,
} from "./AuthAdminUserManagement";
import { AuthAdminWaitlist } from "./AuthAdminWaitlist";

export function AuthAdminRouter({
  enableWaitlist = false,
  extraLinks = [],
  extraRoutes,
  ...props
}: AuthAdminUserManagementProps & {
  enableWaitlist?: boolean;
  extraLinks?: readonly AuthAdminExtraLink[];
  extraRoutes?: ReactNode;
}) {
  return (
    <Route element={<AuthAdminLayout enableWaitlist={enableWaitlist} extraLinks={extraLinks} />}>
      <Route path="/admin/users" element={<AuthAdminUserManagement {...props} />} />
      <Route path="/admin/organizations" element={<AuthAdminOrganizationManagement />} />
      {enableWaitlist && <Route path="/admin/waitlist" element={<AuthAdminWaitlist />} />}
      {extraRoutes}
    </Route>
  );
}
