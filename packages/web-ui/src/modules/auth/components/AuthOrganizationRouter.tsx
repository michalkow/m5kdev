import { Route } from "react-router";
import type { z } from "zod";
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
    AuthOrganizationChildOrganizationsRouteProps,
    AuthOrganizationMembersRouteProps {}

export function AuthOrganizationRouter<S extends z.ZodObject<z.ZodRawShape>>(
  props: AuthOrganizationRouterProps<S>
) {
  return (
    <>
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
