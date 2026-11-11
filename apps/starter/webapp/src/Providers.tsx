import { Toast } from "@heroui/react";
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
import type { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { type ComponentProps, type PropsWithChildren, useCallback } from "react";
import { Toaster } from "sonner";
import { AppErrorBoundary } from "./modules/app/components/AppErrorBoundary";
import { StarterServerEventProvider } from "./StarterServerEventProvider";
import { syncBrowserPosthogIdentity } from "./utils/posthog.utils";

export function Providers({ children, posthog }: PropsWithChildren<{ posthog?: PostHog }>) {
  const handleSession = useCallback<NonNullable<ComponentProps<typeof AuthProvider>["onSession"]>>(
    (session) => syncBrowserPosthogIdentity(posthog, session),
    [posthog]
  );
  const content = (
    <AppErrorBoundary client={posthog}>
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
          <AuthProvider loader={<AppLoader />} onSession={handleSession}>
            <AppTrpcQueryProvider>
              <StarterServerEventProvider>
                <DialogProvider>{children}</DialogProvider>
                <Toaster richColors closeButton />
                <Toast.Provider placement="bottom end" />
              </StarterServerEventProvider>
            </AppTrpcQueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </AppConfigProvider>
    </AppErrorBoundary>
  );
  return posthog ? <PostHogProvider client={posthog}>{content}</PostHogProvider> : content;
}
