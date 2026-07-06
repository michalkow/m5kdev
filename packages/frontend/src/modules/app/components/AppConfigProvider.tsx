import { createContext, type ReactNode } from "react";
import type { AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";

type AppConfig = {
  appUrl: string;
  serverUrl: string;
  appName: string;
  locales?: AuthLocaleConfig;
};

export const AppConfigContext = createContext<AppConfig | null>(null);

export function AppConfigProvider({
  config,
  children,
}: {
  config: AppConfig;
  children: ReactNode;
}) {
  return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}
