import { Toast } from "@heroui/react";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { ServerEventProvider } from "@m5kdev/frontend/modules/app/components/ServerEventProvider";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { DialogProvider } from "@m5kdev/web-ui/components/DialogProvider";
import { ThemeProvider } from "@m5kdev/web-ui/components/theme-provider";
import { AppLoader } from "@m5kdev/web-ui/modules/app/components/AppLoader";
import {
  APP_LOCALE_CONFIG,
  APP_NAME,
  APP_ROLES_CONFIG,
} from "@starter-app/shared/modules/app/app.constants";
import { POST_SERVER_EVENT_RESOURCE } from "@starter-app/shared/modules/posts/posts.constants";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import { createPostListServerEventHandler } from "./modules/posts/hooks/usePostServerEvents";
import { Router } from "./Router";
import { useTRPC } from "./utils/trpc";

function StarterServerEventProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const onPostEvent = createPostListServerEventHandler(trpc);
  return (
    <ServerEventProvider
      handlers={{ [POST_SERVER_EVENT_RESOURCE]: onPostEvent }}
      onReconnect={(queryClient) => {
        void queryClient.invalidateQueries(trpc.posts.list.queryFilter());
      }}
    >
      {children}
    </ServerEventProvider>
  );
}

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
                <StarterServerEventProvider>
                  <DialogProvider>
                    <Router />
                  </DialogProvider>
                  <Toaster richColors closeButton />
                  <Toast.Provider placement="bottom end" />
                </StarterServerEventProvider>
              </AppTrpcQueryProvider>
            </AuthProvider>
          </ThemeProvider>
        </AppConfigProvider>
      </BrowserRouter>
    </NuqsAdapter>
  );
}
