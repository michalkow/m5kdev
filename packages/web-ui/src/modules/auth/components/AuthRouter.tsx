import type { ReactNode } from "react";
import { Route } from "react-router";
import type { z } from "zod";
import { AuthAdminLayout } from "./AuthAdminLayout";
import { AuthAdminOrganizationManagement } from "./AuthAdminOrganizationManagement";
import { AuthAdminUserManagement, type AuthAdminUserManagementProps } from "./AuthAdminUserManagement";
import { AuthAdminWaitlist } from "./AuthAdminWaitlist";
import { ClaimAccountRoute } from "./ClaimAccountRoute";
import { ErrorAuthRoute } from "./ErrorAuthRoute";
import { ForgotPasswordRoute } from "./ForgotPasswordRoute";
import { LoginRoute } from "./LoginRoute";
import { PublicAuthLayout } from "./PublicAuthLayout";
import { ResetPasswordRoute } from "./ResetPasswordRoute";
import { SignupRoute } from "./SignupRoute";
import { UserPreferences, type UserPreferencesProps } from "./UserPreferences";

interface AuthRouterProps {
  header: ReactNode;
  providers?: string[];
  waitlist?: boolean;
}

export function AuthRouter({ header, providers, waitlist }: AuthRouterProps) {
  return (
    <Route element={<PublicAuthLayout header={header} />}>
      <Route path="/login" element={<LoginRoute providers={providers} />} />
      <Route path="/signup" element={<SignupRoute providers={providers} waitlist={waitlist} />} />
      <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
      <Route path="/reset-password" element={<ResetPasswordRoute />} />
      <Route path="/claim-account" element={<ClaimAccountRoute />} />
      <Route path="/error-auth" element={<ErrorAuthRoute />} />
    </Route>
  );
}

export function AuthOrganizationRouter({ header, providers, waitlist }: AuthRouterProps) {
  return (
    <>
      <Route path="/signup" element={<SignupRoute providers={providers} waitlist={waitlist} />} />
      <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
      <Route path="/reset-password" element={<ResetPasswordRoute />} />
      <Route path="/claim-account" element={<ClaimAccountRoute />} />
      <Route path="/error-auth" element={<ErrorAuthRoute />} />
    </>
  );
}

export function AuthUserRouter<S extends z.ZodObject<z.ZodRawShape>>(
  props: UserPreferencesProps<S>
) {
  return <Route path="/user/preferences" element={<UserPreferences {...props} />} />;
}

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
