import { createContext, type ReactNode } from "react";

type AppConfig = {
  appUrl: string;
  serverUrl: string;
  appName: string;
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
