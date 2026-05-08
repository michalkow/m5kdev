import { Route } from "react-router";
import type { z } from "zod";
import {
  AuthOrganizationAcceptInvitationRoute,
  type AuthOrganizationAcceptInvitationRouteProps,
} from "./AuthOrganizationAcceptInvitationRoute";
import {
  AuthOrganizationChildOrganizationsRoute,
  type AuthOrganizationChildOrganizationsRouteProps,
} from "./AuthOrganizationChildOrganizationsRoute";
import {
  AuthOrganizationMembersRoute,
  type AuthOrganizationMembersRouteProps,
} from "./AuthOrganizationMembersRoute";
import {
  AuthOrganizationPreferences,
  type AuthOrganizationPreferencesProps,
} from "./AuthOrganizationPreferences";

export interface AuthOrganizationRouterProps<S extends z.ZodObject<z.ZodRawShape>>
  extends AuthOrganizationPreferencesProps<S>,
    AuthOrganizationAcceptInvitationRouteProps,
    AuthOrganizationChildOrganizationsRouteProps,
    AuthOrganizationMembersRouteProps {}

export function AuthOrganizationRouter<S extends z.ZodObject<z.ZodRawShape>>(
  props: AuthOrganizationRouterProps<S>
) {
  return (
    <>
      <Route
        path="/organization/accept-invitation"
        element={<AuthOrganizationAcceptInvitationRoute {...props} />}
      />
      <Route
        path="/organization/manage"
        element={<AuthOrganizationChildOrganizationsRoute {...props} />}
      />
      <Route path="/organization/members" element={<AuthOrganizationMembersRoute {...props} />} />
      <Route
        path="/organization/preferences"
        element={<AuthOrganizationPreferences {...props} />}
      />
    </>
  );
}
