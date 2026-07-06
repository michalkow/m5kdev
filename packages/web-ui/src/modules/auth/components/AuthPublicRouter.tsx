import type { ReactNode } from "react";
import { Route } from "react-router";
import { AuthPublicClaimAccountRoute } from "./AuthPublicClaimAccountRoute";
import { AuthPublicErrorRoute } from "./AuthPublicErrorRoute";
import { AuthPublicForgotPasswordRoute } from "./AuthPublicForgotPasswordRoute";
import { AuthPublicLayout } from "./AuthPublicLayout";
import { AuthPublicLoginRoute } from "./AuthPublicLoginRoute";
import { AuthPublicResetPasswordRoute } from "./AuthPublicResetPasswordRoute";
import { AuthPublicSignupRoute } from "./AuthPublicSignupRoute";

interface AuthRouterProps {
  header: ReactNode;
  providers?: string[];
  waitlist?: boolean;
  onLocaleChange?: (locale: string) => void | Promise<void>;
}

export function AuthPublicRouter({
  header,
  providers,
  waitlist,
  onLocaleChange,
}: AuthRouterProps) {
  return (
    <Route element={<AuthPublicLayout header={header} onLocaleChange={onLocaleChange} />}>
      <Route path="/login" element={<AuthPublicLoginRoute providers={providers} />} />
      <Route
        path="/signup"
        element={<AuthPublicSignupRoute providers={providers} waitlist={waitlist} />}
      />
      <Route path="/forgot-password" element={<AuthPublicForgotPasswordRoute />} />
      <Route path="/reset-password" element={<AuthPublicResetPasswordRoute />} />
      <Route path="/claim-account" element={<AuthPublicClaimAccountRoute />} />
      <Route path="/error-auth" element={<AuthPublicErrorRoute />} />
    </Route>
  );
}
