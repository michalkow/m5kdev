/**
 * Shared webServer definitions for the Playwright configs. Each profile runs
 * an isolated stack: own port pair, own PostgreSQL database, own email output dir, and
 * own Redis DB index (queue names are identical across profiles — sharing a
 * Redis DB would let one profile's workers consume the other's jobs).
 */

export type E2EProfile = "standard" | "waitlist";

const SERVER_FILTER = "pnpm --filter @starter-app/server exec";
const WEBAPP_FILTER = "pnpm --filter @starter-app/webapp exec";

const SIGNOZ_OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
  "https://signoz-ingester-production-9090.up.railway.app";

const PORTS: Record<
  E2EProfile,
  {
    web: number;
    server: number;
    expoWeb: number;
    expoServer: number;
    redisDb: number;
    expoRedisDb: number;
  }
> = {
  standard: {
    web: 15173,
    server: 18180,
    expoWeb: 15183,
    expoServer: 18182,
    redisDb: 1,
    expoRedisDb: 3,
  },
  waitlist: {
    web: 15174,
    server: 18181,
    expoWeb: 15184,
    expoServer: 18183,
    redisDb: 2,
    expoRedisDb: 4,
  },
};

function serverEnv(profile: E2EProfile, expo: boolean): Record<string, string> {
  const ports = PORTS[profile];
  const serverPort = expo ? ports.expoServer : ports.server;
  const webPort = expo ? ports.expoWeb : ports.web;
  const suffix = expo ? `${profile}-expo` : profile;
  const databaseConnection = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`${key} is required for PostgreSQL E2E tests`);
    const url = new URL(value);
    url.pathname = `${url.pathname}_e2e_${suffix.replaceAll("-", "_")}`;
    return url.toString();
  };
  return {
    PORT: String(serverPort),
    VITE_SERVER_URL: `http://127.0.0.1:${serverPort}`,
    VITE_APP_URL: `http://127.0.0.1:${webPort}`,
    DATABASE_URL: databaseConnection("E2E_DATABASE_URL"),
    DATABASE_DIRECT_URL: databaseConnection("E2E_DATABASE_DIRECT_URL"),
    DATABASE_SCHEMA: "app",
    DATABASE_DISPOSABLE: process.env.E2E_DATABASE_DISPOSABLE ?? "false",
    MASTRA_DATABASE_URL: "",
    MASTRA_DATABASE_DIRECT_URL: "",
    VECTOR_DATABASE_URL: "",
    VECTOR_DATABASE_DIRECT_URL: "",
    MASTRA_DATABASE_SCHEMA: "mastra",
    VECTOR_DATABASE_SCHEMA: "vectors",
    EMAIL_OUTPUT_DIRECTORY: `.e2e/emails-${suffix}`,
    PROVISIONED_EMAIL_DOMAIN: "provisioned.auth-e2e.local",
    REDIS_URL: `redis://127.0.0.1:6379/${expo ? PORTS[profile].expoRedisDb : PORTS[profile].redisDb}`,
    VITE_ENABLE_WAITLIST: profile === "waitlist" ? "true" : "false",
    AUTH_E2E_PROFILE: profile,
    M5K_MCP_E2E_CIMD: "1",
    BETTER_AUTH_SECRET: "auth-e2e-local-secret-auth-e2e-local-secret",
    SYSTEM_NOTIFICATION_EMAIL: "ops@auth-e2e.local",
    NODE_ENV: "development",
    APP_ENV: "local",
    APP_SLUG: "starter-app",
    // hermetic: a real key in the invoking shell would flip email mode to
    // "send" and the stored-email assertions would find nothing
    RESEND_API_KEY: "",
    ...(process.env.OTEL_SDK_DISABLED === "true"
      ? {}
      : {
          OTEL_EXPORTER_OTLP_ENDPOINT: SIGNOZ_OTLP_ENDPOINT,
          OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
          OTEL_SERVICE_NAME: `starter-server-e2e-${suffix}`,
          OTEL_RESOURCE_ATTRIBUTES: `deployment.environment=e2e,e2e.profile=${profile},e2e.platform=${expo ? "expo" : "web"}`,
        }),
  };
}

export function serverWebServer(profile: E2EProfile, { expo = false } = {}) {
  const env = serverEnv(profile, expo);
  return {
    command: [
      `${SERVER_FILTER} tsx db.ts reset`,
      `${SERVER_FILTER} tsx db.ts migrate`,
      // m5k:ai:start
      `${SERVER_FILTER} tsx mastra.ts`,
      // m5k:ai:end
      `${SERVER_FILTER} tsx db.e2e.ts seed`,
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
