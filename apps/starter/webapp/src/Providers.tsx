import { Spinner, Toast } from "@heroui/react";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { DialogProvider } from "@m5kdev/web-ui/components/DialogProvider";
import { ThemeProvider } from "@m5kdev/web-ui/components/theme-provider";
import { APP_LOCALE_CONFIG, APP_ROLES_CONFIG } from "@starter-app/shared/modules/app/app.constants";
import type { PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { type ComponentProps, type PropsWithChildren, useCallback } from "react";
import { Toaster } from "sonner";
import { AppErrorBoundary } from "./modules/app/components/AppErrorBoundary";
import { ExperienceBootstrap } from "./modules/app/components/ExperienceBootstrap";
import { StarterServerEventProvider } from "./StarterServerEventProvider";
import { syncBrowserPosthogIdentity } from "./utils/posthog.utils";

function StarterAuthLoader() {
  const { appName, experience } = useAppConfig();
  return (
    <main role="status" className="flex min-h-screen flex-col items-center justify-center gap-5">
      {experience?.brand.logo ? (
        <img src={experience.brand.logo} alt="" className="size-12" />
      ) : null}
      <h1 className="font-editorial text-3xl">{appName}</h1>
      <Spinner size="xl" />
    </main>
  );
}
export function Providers({
  children,
  posthog,
  experience,
  bootstrapUrl,
}: PropsWithChildren<{
  posthog?: PostHog;
  experience?: PublicExperience;
  bootstrapUrl?: string;
}>) {
  const handleSession = useCallback<NonNullable<ComponentProps<typeof AuthProvider>["onSession"]>>(
    (session) => syncBrowserPosthogIdentity(posthog, session),
    [posthog]
  );
  const content = (
    <AppErrorBoundary client={posthog}>
      <ExperienceBootstrap
        url={
          bootstrapUrl ??
          `${(import.meta.env.VITE_SERVER_URL ?? "").replace(/\/$/, "")}/app/experience`
        }
        supplied={experience}
        locales={APP_LOCALE_CONFIG}
        roles={APP_ROLES_CONFIG}
      >
        <ThemeProvider defaultTheme="light" storageKey="m5kdev-theme">
          <AuthProvider loader={<StarterAuthLoader />} onSession={handleSession}>
            <AppTrpcQueryProvider>
              <StarterServerEventProvider>
                <DialogProvider>{children}</DialogProvider>
                <Toaster richColors closeButton />
                <Toast.Provider placement="bottom end" />
              </StarterServerEventProvider>
            </AppTrpcQueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </ExperienceBootstrap>
    </AppErrorBoundary>
  );
  return posthog ? <PostHogProvider client={posthog}>{content}</PostHogProvider> : content;
}
