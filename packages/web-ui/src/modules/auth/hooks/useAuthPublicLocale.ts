import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useCallback, useEffect, useState } from "react";
import { persistPublicLocale, resolvePublicLocale } from "../utils/authLocale";

export function useAuthPublicLocale(onLocaleChange?: (locale: string) => void | Promise<void>) {
  const { locales } = useAppConfig();
  const [locale, setLocaleState] = useState(() =>
    locales ? resolvePublicLocale(locales) : null
  );

  useEffect(() => {
    if (!locales) return;

    const resolved = resolvePublicLocale(locales);
    setLocaleState(resolved);
    void onLocaleChange?.(resolved);
    // Initial i18n sync when locale config becomes available; onLocaleChange is app-provided and stable.
  }, [locales]);

  const setLocale = useCallback(
    async (nextLocale: string) => {
      if (!locales) return;

      const resolved = persistPublicLocale(nextLocale, locales);
      setLocaleState(resolved);
      await onLocaleChange?.(resolved);
    },
    [locales, onLocaleChange]
  );

  return {
    locale,
    setLocale,
    locales,
  };
}
