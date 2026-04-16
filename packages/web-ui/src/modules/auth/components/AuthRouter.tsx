import type { ReactNode } from "react";
import { Route } from "react-router";
import { AuthLayout } from "./AuthLayout";
import { ClaimAccountRoute } from "./ClaimAccountRoute";
import { ErrorAuthRoute } from "./ErrorAuthRoute";
import { ForgotPasswordRoute } from "./ForgotPasswordRoute";
import { LoginRoute } from "./LoginRoute";
import { ResetPasswordRoute } from "./ResetPasswordRoute";
import { SignupRoute } from "./SignupRoute";

interface AuthRouterProps {
  header: ReactNode;
  providers?: string[];
  waitlist?: boolean;
}

export function AuthRouter({ header, providers, waitlist }: AuthRouterProps) {
  return (
    <Route element={<AuthLayout header={header} />}>
      <Route path="/login" element={<LoginRoute providers={providers} />} />
      <Route path="/signup" element={<SignupRoute providers={providers} waitlist={waitlist} />} />
      <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
      <Route path="/reset-password" element={<ResetPasswordRoute />} />
      <Route path="/claim-account" element={<ClaimAccountRoute />} />
      <Route path="/error-auth" element={<ErrorAuthRoute />} />
    </Route>
  );
}
