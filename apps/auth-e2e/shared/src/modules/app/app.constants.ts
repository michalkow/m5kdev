export const APP_NAME = "Auth E2E Blog";
export const APP_SLUG = "auth-e2e-blog";

export const AUTH_E2E_PROFILES = ["standard", "waitlist"] as const;
export type AuthE2EProfile = (typeof AUTH_E2E_PROFILES)[number];

export const AUTH_E2E_PORTS = {
  standard: {
    server: 18180,
    webapp: 15173,
    expo: 15183,
    expoServer: 18182,
  },
  waitlist: {
    server: 18181,
    webapp: 15174,
    expo: 15184,
    expoServer: 18183,
  },
} as const satisfies Record<
  AuthE2EProfile,
  { server: number; webapp: number; expo: number; expoServer: number }
>;
