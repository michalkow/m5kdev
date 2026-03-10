import type { ReactNode } from "react";
import { Route } from "react-router";
import { AuthLayout } from "#modules/auth/components/AuthLayout";
import { ClaimAccountRoute } from "#modules/auth/components/ClaimAccountRoute";
import { ErrorAuthRoute } from "#modules/auth/components/ErrorAuthRoute";
import { ForgotPasswordRoute } from "#modules/auth/components/ForgotPasswordRoute";
import { LoginRoute } from "#modules/auth/components/LoginRoute";
import { ResetPasswordRoute } from "#modules/auth/components/ResetPasswordRoute";
import { SignupRoute } from "#modules/auth/components/SignupRoute";
import type { UseBackendTRPC } from "#types";

interface AuthRouterProps {
  header: ReactNode;
  providers?: string[];
  useTRPC?: UseBackendTRPC;
}

export function AuthRouter({ header, providers, useTRPC }: AuthRouterProps) {
  return (
    <Route element={<AuthLayout header={header} />}>
      <Route path="/login" element={<LoginRoute providers={providers} />} />
      <Route path="/signup" element={<SignupRoute providers={providers} useTRPC={useTRPC} />} />
      <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
      <Route path="/reset-password" element={<ResetPasswordRoute />} />
      <Route path="/claim-account" element={<ClaimAccountRoute useTRPC={useTRPC} />} />
      <Route path="/error-auth" element={<ErrorAuthRoute />} />
    </Route>
  );
}
