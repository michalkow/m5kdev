import { APP_NAME } from "@starter-app/shared/modules/app/app.constants";
import { getDocumentationUrl } from "../../documentation";

/** Permanent standalone native authoring; strict apps compose ExperienceBootstrap instead. */
export const appTitle = APP_NAME;
export const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? "http://127.0.0.1:8081";

export const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://127.0.0.1:8080";

export const isWaitlistProfile = process.env.EXPO_PUBLIC_ENABLE_WAITLIST === "true";

export function getDocsUrl(
  apiOrigin: string,
  locale = Intl.DateTimeFormat().resolvedOptions().locale
) {
  return getDocumentationUrl({
    url: process.env.EXPO_PUBLIC_DOCS_URL,
    serverUrl: apiOrigin,
    development: __DEV__,
    locale,
  });
}
