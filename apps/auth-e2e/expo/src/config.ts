import {
  APP_NAME,
  AUTH_E2E_PORTS,
  type AuthE2EProfile,
} from "m5kdev-auth-e2e-shared/modules/app/app.constants";

export const profile = (process.env.EXPO_PUBLIC_AUTH_E2E_PROFILE ?? "standard") as AuthE2EProfile;

const defaults = AUTH_E2E_PORTS[profile] ?? AUTH_E2E_PORTS.standard;

export const serverUrl =
  process.env.EXPO_PUBLIC_SERVER_URL ?? `http://127.0.0.1:${defaults.expoServer}`;

export const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? `http://127.0.0.1:${defaults.expo}`;

export const isWaitlistProfile = profile === "waitlist";

export const appTitle = APP_NAME;
