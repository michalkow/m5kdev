import { USER_LOCALE_HEADER } from "@m5kdev/commons/modules/auth/auth.constants";
import {
  getAllowedLocaleCodes,
  resolveAppLocale,
  toCanonicalLocale,
  type AuthLocaleConfig,
} from "@m5kdev/commons/modules/auth/auth.locale";
import { getBrowserLocale } from "@m5kdev/frontend/modules/app/utils/locale";

export const PUBLIC_AUTH_LOCALE_STORAGE_KEY = "auth:public-locale:v1" as const;

export function getStoredPublicLocale(): string | null {
  try {
    return localStorage.getItem(PUBLIC_AUTH_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredPublicLocale(locale: string): void {
  try {
    localStorage.setItem(PUBLIC_AUTH_LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage may be unavailable in private browsing or when disabled
  }
}

export function resolvePublicLocale(config: AuthLocaleConfig): string {
  const stored = getStoredPublicLocale();
  if (stored) {
    const canonical = toCanonicalLocale(stored, getAllowedLocaleCodes(config));
    if (canonical) return canonical;
  }

  return getBrowserLocale(config);
}

export function createUserLocaleHeaders(
  config: AuthLocaleConfig,
  locale?: string
): Record<string, string> {
  return {
    [USER_LOCALE_HEADER]: locale ?? resolvePublicLocale(config),
  };
}

export function persistPublicLocale(locale: string, config: AuthLocaleConfig): string {
  const resolved = resolveAppLocale(locale, config);
  setStoredPublicLocale(resolved);
  return resolved;
}
