import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { DialogProvider } from "@m5kdev/web-ui/components/DialogProvider";
import { ThemeProvider } from "@m5kdev/web-ui/components/theme-provider";
import { AppLoader } from "@m5kdev/web-ui/modules/app/components/AppLoader";
import {
  APP_LOCALE_CONFIG,
  APP_NAME,
  APP_ROLES_CONFIG,
} from "@starter-app/shared/modules/app/app.constants";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import { Router } from "./Router";

export function App() {
  return (
    <NuqsAdapter>
      <BrowserRouter>
        <AppConfigProvider
          config={{
            appName: APP_NAME,
            appUrl: import.meta.env.VITE_APP_URL,
            serverUrl: import.meta.env.VITE_SERVER_URL,
            locales: APP_LOCALE_CONFIG,
            roles: APP_ROLES_CONFIG,
          }}
        >
          <ThemeProvider defaultTheme="light" storageKey="m5kdev-theme">
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
      </BrowserRouter>
    </NuqsAdapter>
  );
}
