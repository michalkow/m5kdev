import { Toast } from "@heroui/react";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { keepPreviousData } from "@tanstack/react-query";
import { type PropsWithChildren, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function Identity() {
  const { appName, experience } = useAppConfig();
  return (
    <header className="mx-auto max-w-5xl space-y-2 border-b p-6">
      <title>{appName}</title>
      <h1 className="text-2xl font-semibold" data-testid="brand">
        {appName}
      </h1>
      <p data-testid="product">{experience?.product}</p>
    </header>
  );
}
export function Providers({
  children,
  supplied,
}: PropsWithChildren<{ supplied?: PublicExperience }>) {
  const { t } = useTranslation("reference");
  const [experience, setExperience] = useState(supplied);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (supplied) return;
    const controller = new AbortController();
    loadExperience({ signal: controller.signal })
      .then(setExperience)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [supplied]);
  if (failed) return <p role="alert">{t("bootstrapError")}</p>;
  if (!experience) return <p role="status">{t("bootstrap")}</p>;
  return (
    <AppConfigProvider
      config={{
        experience,
        locales: {
          defaultLocale: "en",
          locales: [
            { code: "en", displayName: "English" },
            { code: "en_GB", displayName: "English (UK)" },
          ],
        },
      }}
    >
      <Identity />
      <AuthProvider loader={<p role="status">{t("session")}</p>}>
        <AppTrpcQueryProvider
          queryClientConfig={{
            defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } },
          }}
        >
          {children}
          <Toast.Provider placement="bottom end" />
        </AppTrpcQueryProvider>
      </AuthProvider>
    </AppConfigProvider>
  );
}
