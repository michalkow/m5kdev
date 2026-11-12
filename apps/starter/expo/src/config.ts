import { APP_NAME } from "@starter-app/shared/modules/app/app.constants";

import { getDocumentationUrl } from "../../documentation";

export const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://127.0.0.1:8080";

export const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? "http://127.0.0.1:8081";

export const isWaitlistProfile = process.env.EXPO_PUBLIC_ENABLE_WAITLIST === "true";

export const appTitle = APP_NAME;

export function getDocsUrl(locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  return getDocumentationUrl({
    url: process.env.EXPO_PUBLIC_DOCS_URL,
    serverUrl,
    development: __DEV__,
    locale,
  });
}
