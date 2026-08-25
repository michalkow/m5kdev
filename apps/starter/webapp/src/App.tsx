// biome-ignore-all assist/source/organizeImports: feature-gated Server event imports stay in marker blocks
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
// m5k:workflows:start
import { DEMO_WORKFLOW_SERVER_EVENT_RESOURCE } from "@starter-app/shared/modules/demo-workflow/demo-workflow.constants";
// m5k:workflows:end
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
// m5k:workflows:start
import { createWorkflowListServerEventHandler } from "./modules/workflows/hooks/useWorkflowServerEvents";
import { useTRPC } from "./utils/trpc";
// m5k:workflows:end
import { Router } from "./Router";

function StarterServerEventProvider({ children }: { children: ReactNode }) {
  // m5k:workflows:start
  const trpc = useTRPC();
  // m5k:workflows:end
  return (
    <ServerEventProvider
      // m5k:workflows:start
      handlers={{
        [DEMO_WORKFLOW_SERVER_EVENT_RESOURCE]: createWorkflowListServerEventHandler(trpc),
      }}
      onReconnect={(queryClient) => {
        void queryClient.invalidateQueries(trpc.workflow.list.queryFilter());
      }}
      // m5k:workflows:end
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
