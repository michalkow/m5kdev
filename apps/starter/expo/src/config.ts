import { APP_NAME } from "@starter-app/shared/modules/app/app.constants";

export const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://127.0.0.1:8080";

export const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? "http://127.0.0.1:8081";

export const isWaitlistProfile = process.env.EXPO_PUBLIC_ENABLE_WAITLIST === "true";

export const appTitle = APP_NAME;
