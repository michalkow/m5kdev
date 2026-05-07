import { Route } from "react-router";
import { AuthAdminLayout } from "./AuthAdminLayout";
import { AuthAdminOrganizationManagement } from "./AuthAdminOrganizationManagement";
import { AuthAdminUserManagement, type AuthAdminUserManagementProps } from "./AuthAdminUserManagement";
import { AuthAdminWaitlist } from "./AuthAdminWaitlist";

export function AuthAdminRouter({
  enableWaitlist = false,
  ...props
}: AuthAdminUserManagementProps & { enableWaitlist?: boolean }) {
  return (
    <Route element={<AuthAdminLayout enableWaitlist={enableWaitlist} />}>
      <Route path="/admin/users" element={<AuthAdminUserManagement {...props} />} />
      <Route path="/admin/organizations" element={<AuthAdminOrganizationManagement />} />
      {enableWaitlist && <Route path="/admin/waitlist" element={<AuthAdminWaitlist />} />}
    </Route>
  );
}
