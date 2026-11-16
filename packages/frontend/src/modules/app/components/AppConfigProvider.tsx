import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import type { AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";
import type { AuthRolesConfig } from "@m5kdev/commons/modules/auth/auth.roles";
import { createContext, type ReactNode } from "react";

type AppConfig = {
  appUrl: string;
  serverUrl: string;
  appName: string;
  locales?: AuthLocaleConfig;
  roles?: AuthRolesConfig;
  experience?: PublicExperience;
};

type AppConfigInput =
  | Omit<AppConfig, "experience">
  | {
      experience: PublicExperience;
      locales?: AuthLocaleConfig;
      roles?: AuthRolesConfig;
    };

export const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({
  config,
  children,
}: {
  config: AppConfigInput;
  children: ReactNode;
}) {
  const resolved: AppConfig =
    "experience" in config
      ? {
          appName: config.experience.brand.name,
          appUrl: config.experience.webOrigin,
          serverUrl: config.experience.apiOrigin,
          ...config,
        }
      : config;
  return <AppConfigContext.Provider value={resolved}>{children}</AppConfigContext.Provider>;
}
