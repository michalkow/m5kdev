import {
  type AuthLocaleConfig,
  resolveAppLocale,
  toCanonicalLocale,
  toI18nLanguageTag,
} from "@m5kdev/commons/modules/auth/auth.locale";
import { createInstance, type i18n, type TFunction } from "i18next";

export type BackendAppI18nResources = Record<
  string,
  { translation: Record<string, unknown> }
>;

export interface AppI18n {
  readonly instance: i18n;
  readonly defaultLocale: string;
  getFixedT(locale?: string | null): TFunction;
  t(
    locale: string | null | undefined,
    key: string,
    options?: Record<string, unknown>
  ): string;
}

function buildFallbackLocales(locales: AuthLocaleConfig): string[] {
  const fallbacks = new Set<string>();

  for (const locale of locales.allowedLocales) {
    const normalized = toCanonicalLocale(locale, locales.allowedLocales);
    if (!normalized) continue;

    fallbacks.add(toI18nLanguageTag(normalized));

    const languageOnly = normalized.split("_")[0];
    if (languageOnly && languageOnly !== normalized) {
      const languageCanonical = toCanonicalLocale(languageOnly, locales.allowedLocales);
      if (languageCanonical) {
        fallbacks.add(toI18nLanguageTag(languageCanonical));
      }
    }
  }

  const defaultCanonical = resolveAppLocale(null, locales);
  fallbacks.add(toI18nLanguageTag(defaultCanonical));

  return [...fallbacks];
}

function toI18nResources(resources: BackendAppI18nResources): Record<
  string,
  { translation: Record<string, unknown> }
> {
  const mapped: Record<string, { translation: Record<string, unknown> }> = {};

  for (const [locale, bundle] of Object.entries(resources)) {
    mapped[toI18nLanguageTag(locale)] = bundle;
  }

  return mapped;
}

export function createAppI18n(
  locales: AuthLocaleConfig,
  resources: BackendAppI18nResources = {}
): AppI18n {
  const defaultLocale = resolveAppLocale(null, locales);
  const instance = createInstance();

  instance.init({
    lng: toI18nLanguageTag(defaultLocale),
    fallbackLng: buildFallbackLocales(locales),
    resources: toI18nResources(resources),
    interpolation: {
      escapeValue: false,
    },
    initImmediate: false,
  });

  const resolveLocale = (locale?: string | null): string => {
    if (locale) {
      const canonical = toCanonicalLocale(locale, locales.allowedLocales);
      if (canonical) return canonical;
    }

    return defaultLocale;
  };

  return {
    instance,
    defaultLocale,
    getFixedT(locale?: string | null): TFunction {
      return instance.getFixedT(toI18nLanguageTag(resolveLocale(locale)));
    },
    t(
      locale: string | null | undefined,
      key: string,
      options?: Record<string, unknown>
    ): string {
      return this.getFixedT(locale)(key, options);
    },
  };
}
