import { Button } from "@heroui/react";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import type { AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";
import type { AuthRolesConfig } from "@m5kdev/commons/modules/auth/auth.roles";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { useExperienceBootstrap } from "../hooks/useExperienceBootstrap";
export function ExperienceBootstrap({
  children,
  url,
  supplied,
  locales,
  roles,
}: PropsWithChildren<{
  url: string;
  supplied?: PublicExperience;
  locales?: AuthLocaleConfig;
  roles?: AuthRolesConfig;
}>) {
  const { t } = useTranslation("starter-app");
  const state = useExperienceBootstrap(url, supplied);
  if (state.status === "error")
    return (
      <main role="alert" className="grid min-h-screen place-content-center gap-4 p-6">
        <p>{t("bootstrap.error")}</p>
        <Button onPress={state.retry}>{t("bootstrap.retry")}</Button>
      </main>
    );
  if (state.status === "pending")
    return (
      <main role="status" className="grid min-h-screen place-content-center p-6">
        {t("bootstrap.loading")}
      </main>
    );
  return (
    <AppConfigProvider config={{ experience: state.experience, locales, roles }}>
      <title>{state.experience.brand.name}</title>
      <meta
        name="description"
        content={state.experience.brand.tagline ?? state.experience.brand.name}
      />
      {children}
    </AppConfigProvider>
  );
}
