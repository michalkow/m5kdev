import {
  type AuthLocaleConfig,
  resolveAppLocale,
  toI18nLanguageTag,
} from "@m5kdev/commons/modules/auth/auth.locale";
import i18n from "i18next";

export function getBrowserLocale(config: AuthLocaleConfig): string {
  if (typeof navigator === "undefined") {
    return resolveAppLocale(null, config);
  }
  return resolveAppLocale(navigator.language, config);
}

export async function syncI18nLocale(locale: string): Promise<void> {
  const languageTag = toI18nLanguageTag(locale);
  if (i18n.language === languageTag) return;
  await i18n.changeLanguage(languageTag);
}
