/**
 * Shared webServer definitions for the Playwright configs. Each profile runs
 * an isolated stack: own port pair, own SQLite file, own email output dir, and
 * own Redis DB index (queue names are identical across profiles — sharing a
 * Redis DB would let one profile's workers consume the other's jobs).
 */

export type E2EProfile = "standard" | "waitlist";

const SERVER_FILTER = "pnpm --filter @starter-app/server exec";
const WEBAPP_FILTER = "pnpm --filter @starter-app/webapp exec";

const PORTS: Record<E2EProfile, { web: number; server: number; expoWeb: number; expoServer: number; redisDb: number; expoRedisDb: number }> = {
  standard: { web: 15173, server: 18180, expoWeb: 15183, expoServer: 18182, redisDb: 1, expoRedisDb: 3 },
  waitlist: { web: 15174, server: 18181, expoWeb: 15184, expoServer: 18183, redisDb: 2, expoRedisDb: 4 },
};

function serverEnv(profile: E2EProfile, expo: boolean): Record<string, string> {
  const ports = PORTS[profile];
  const serverPort = expo ? ports.expoServer : ports.server;
  const webPort = expo ? ports.expoWeb : ports.web;
  const suffix = expo ? `${profile}-expo` : profile;
  return {
    PORT: String(serverPort),
    VITE_SERVER_URL: `http://127.0.0.1:${serverPort}`,
    VITE_APP_URL: `http://127.0.0.1:${webPort}`,
    DATABASE_URL: `file:./.e2e/${suffix}.db`,
    EMAIL_OUTPUT_DIRECTORY: `.e2e/emails-${suffix}`,
    PROVISIONED_EMAIL_DOMAIN: "provisioned.auth-e2e.local",
    REDIS_URL: `redis://127.0.0.1:6379/${expo ? PORTS[profile].expoRedisDb : PORTS[profile].redisDb}`,
    VITE_ENABLE_WAITLIST: profile === "waitlist" ? "true" : "false",
    AUTH_E2E_PROFILE: profile,
    BETTER_AUTH_SECRET: "auth-e2e-local-secret-auth-e2e-local-secret",
    SYSTEM_NOTIFICATION_EMAIL: "ops@auth-e2e.local",
    NODE_ENV: "development",
    // hermetic: a real key in the invoking shell would flip email mode to
    // "send" and the stored-email assertions would find nothing
    RESEND_API_KEY: "",
  };
}

export function serverWebServer(profile: E2EProfile, { expo = false } = {}) {
  const env = serverEnv(profile, expo);
  return {
    command: [
      `${SERVER_FILTER} tsx drizzle/reset.ts`,
      `${SERVER_FILTER} drizzle-kit migrate`,
      `${SERVER_FILTER} tsx drizzle/seed.e2e.ts`,
      `${SERVER_FILTER} tsx src/index.ts`,
    ].join(" && "),
    url: `${env.VITE_SERVER_URL}/__emails`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env,
  };
}

export function webappWebServer(profile: E2EProfile) {
  const ports = PORTS[profile];
  const env = serverEnv(profile, false);
  return {
    command: `${WEBAPP_FILTER} vite --host 127.0.0.1 --port ${ports.web}`,
    url: `http://127.0.0.1:${ports.web}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SERVER_URL: env.VITE_SERVER_URL,
      VITE_APP_URL: env.VITE_APP_URL,
      VITE_ENABLE_WAITLIST: env.VITE_ENABLE_WAITLIST,
    },
  };
}

export function expoWebServer(profile: E2EProfile) {
  const ports = PORTS[profile];
  const env = serverEnv(profile, true);
  return {
    command: `pnpm --filter @starter-app/expo exec expo start --web --port ${ports.expoWeb} --host localhost`,
    url: `http://127.0.0.1:${ports.expoWeb}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      EXPO_PUBLIC_SERVER_URL: env.VITE_SERVER_URL,
      EXPO_PUBLIC_APP_URL: `http://127.0.0.1:${ports.expoWeb}`,
      EXPO_PUBLIC_ENABLE_WAITLIST: env.VITE_ENABLE_WAITLIST,
      EXPO_NO_TELEMETRY: "1",
      BROWSER: "none",
    },
  };
}

export const BASE_URLS: Record<E2EProfile, string> = {
  standard: `http://127.0.0.1:${PORTS.standard.web}`,
  waitlist: `http://127.0.0.1:${PORTS.waitlist.web}`,
};

export const EXPO_BASE_URLS: Record<E2EProfile, string> = {
  standard: `http://127.0.0.1:${PORTS.standard.expoWeb}`,
  waitlist: `http://127.0.0.1:${PORTS.waitlist.expoWeb}`,
};
