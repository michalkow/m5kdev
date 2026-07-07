import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { DialogProvider } from "@m5kdev/web-ui/components/DialogProvider";
import { ThemeProvider } from "@m5kdev/web-ui/components/theme-provider";
import { AppLoader } from "@m5kdev/web-ui/modules/app/components/AppLoader";
import { APP_NAME } from "m5kdev-auth-e2e-shared/modules/app/app.constants";
import { AUTH_LOCALE_CONFIG } from "m5kdev-auth-e2e-shared/modules/app/locale.constants";
import { APP_ROLES_CONFIG } from "m5kdev-auth-e2e-shared/modules/app/roles.constants";
import { Toaster } from "sonner";
import { Router } from "./Router";

export function Providers() {
  return (
    <AppConfigProvider
      config={{
        appName: APP_NAME,
        appUrl: import.meta.env.VITE_APP_URL,
        serverUrl: import.meta.env.VITE_SERVER_URL,
        locales: AUTH_LOCALE_CONFIG,
        roles: APP_ROLES_CONFIG,
      }}
    >
      <ThemeProvider defaultTheme="light" storageKey="auth-e2e-theme">
        <AuthProvider loader={<AppLoader />}>
          <AppTrpcQueryProvider>
            <DialogProvider>
              <Router />
            </DialogProvider>
            <Toaster richColors closeButton />
          </AppTrpcQueryProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppConfigProvider>
  );
}
