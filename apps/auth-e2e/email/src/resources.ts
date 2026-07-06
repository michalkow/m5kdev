import type { BackendAppI18nResources } from "@m5kdev/backend/i18n/app-i18n";
import { en } from "./translations/en";
import { en_GB } from "./translations/en_GB";

export const emailResources = {
  en: { translation: en },
  en_GB: { translation: en_GB },
} satisfies BackendAppI18nResources;
