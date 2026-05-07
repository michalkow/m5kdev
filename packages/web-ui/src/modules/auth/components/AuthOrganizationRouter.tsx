import { Route } from "react-router";
import { AuthOrganizationAcceptInvitationRoute } from "./AuthOrganizationAcceptInvitationRoute";
import { AuthOrganizationChildOrganizationsRoute } from "./AuthOrganizationChildOrganizationsRoute";

export function AuthOrganizationRouter() {
  return (
    <>
      <Route
        path="/organization/accept-invitation"
        element={<AuthOrganizationAcceptInvitationRoute />}
      />
      <Route path="/organization/manage" element={<AuthOrganizationChildOrganizationsRoute />} />
    </>
  );
}
