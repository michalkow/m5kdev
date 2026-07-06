import { USER_LOCALE_HEADER } from "@m5kdev/commons/modules/auth/auth.constants";
import type { AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";
import { getBrowserLocale } from "@m5kdev/frontend/modules/app/utils/locale";

export function createUserLocaleHeaders(
  config: AuthLocaleConfig,
  locale?: string
): Record<string, string> {
  return {
    [USER_LOCALE_HEADER]: locale ?? getBrowserLocale(config),
  };
}
