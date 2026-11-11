import type { Pool } from "pg";
import { createBackendApp } from "./app";
import { createTestPool } from "./test/postgresql";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const localEnv = { APP_ENV: "local", APP_SLUG: "editorial-desk" };

describe("createBackendApp Deployment environment", () => {
  let client: Pool;

  beforeEach(() => {
    client = createTestPool();
  });

  afterEach(async () => {
    await client.end();
  });

  it("refuses to boot without APP_ENV", () => {
    expect(() => createBackendApp({ db: { client }, env: { APP_SLUG: "editorial-desk" } })).toThrow(
      /APP_ENV/
    );
  });

  it("refuses an unknown APP_ENV and a missing APP_SLUG", () => {
    expect(() =>
      createBackendApp({ db: { client }, env: { ...localEnv, APP_ENV: "prod" } })
    ).toThrow(/APP_ENV/);
    expect(() => createBackendApp({ db: { client }, env: { APP_ENV: "local" } })).toThrow(
      /APP_SLUG/
    );
  });

  it("refuses to boot a deployed environment without public URLs", () => {
    expect(() =>
      createBackendApp({
        db: { client },
        env: { APP_ENV: "production", APP_SLUG: "editorial-desk" },
      })
    ).toThrow(/VITE_APP_URL/);
  });

  it("boots locally without public URLs and exposes the environment", () => {
    let seen: { environment?: string; slug?: string } = {};
    const built = createBackendApp({ db: { client }, env: localEnv }, [
      {
        id: "probe",
        services: ({ appConfig }: { appConfig: { environment: string; slug: string } }) => {
          seen = { environment: appConfig.environment, slug: appConfig.slug };
          return {};
        },
      },
    ] as never);
    expect(built).toBeTruthy();
    expect(seen).toEqual({ environment: "local", slug: "editorial-desk" });
  });

  it("chooses the default email mode from APP_ENV, not NODE_ENV", () => {
    const modeFor = (env: Record<string, string>) => {
      let mode: string | undefined;
      createBackendApp({ db: { client }, env }, [
        {
          id: "probe",
          services: ({ emailConfig }: { emailConfig: { mode: string } }) => {
            mode = emailConfig.mode;
            return {};
          },
        },
      ] as never);
      return mode;
    };
    expect(modeFor({ ...localEnv, NODE_ENV: "production" })).toBe("log");
    expect(
      modeFor({
        APP_ENV: "development",
        APP_SLUG: "editorial-desk",
        NODE_ENV: "development",
        VITE_APP_URL: "https://dev.example.test",
        VITE_SERVER_URL: "https://api.dev.example.test",
      })
    ).toBe("send");
  });
});
