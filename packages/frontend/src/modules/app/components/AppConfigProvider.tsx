import {
  type PublicExperience,
  publicExperienceSchema,
} from "@m5kdev/commons/modules/app/experience.schema";
import type { AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";
import type { AuthRolesConfig } from "@m5kdev/commons/modules/auth/auth.roles";
import { createContext, type ReactNode } from "react";

export type AppConfig = {
  appUrl: string;
  serverUrl: string;
  appName: string;
  locales?: AuthLocaleConfig;
  roles?: AuthRolesConfig;
  experience?: PublicExperience;
};

export type AppConfigInput =
  | (Omit<AppConfig, "experience"> & { experience?: never })
  | {
      experience: PublicExperience;
      appName?: never;
      appUrl?: never;
      serverUrl?: never;
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
  let resolved: AppConfig;
  if ("experience" in config) {
    if (["appName", "appUrl", "serverUrl"].some((key) => Object.hasOwn(config, key)))
      throw new Error("Do not mix Experience descriptor and single-Experience configuration");
    const experience = publicExperienceSchema.parse(config.experience);
    resolved = {
      experience,
      appName: experience.brand.name,
      appUrl: experience.webOrigin,
      serverUrl: experience.apiOrigin,
      locales: config.locales,
      roles: config.roles,
    };
  } else resolved = config;
  return <AppConfigContext.Provider value={resolved}>{children}</AppConfigContext.Provider>;
}
