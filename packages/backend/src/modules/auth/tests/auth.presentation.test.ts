import { drizzle } from "drizzle-orm/node-postgres";
import { ExperienceRegistry } from "../../../experience";
import { experienceConfig, prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import * as schema from "../auth.db";
import { createBetterAuth } from "../auth.lib";

const SECRET = "standalone-presentation-secret-at-least-thirty-two-characters";
describe("Standalone Auth presentation boundary", () => {
  it.each([
    { name: "" },
    { urls: {} },
    { brand: {} },
    { experienceRegistry: new ExperienceRegistry(experienceConfig) },
    null,
  ])("rejects ambiguous/invalid provided raw registry authoring %j", async (extra) => {
    const pool = createTestPool();
    try {
      const app =
        extra === null ? { experiences: null } : { experiences: experienceConfig, ...extra };
      expect(() =>
        createBetterAuth({
          orm: drizzle(pool, { schema }),
          schema,
          services: {},
          app: app as never,
          options: { secret: SECRET },
        })
      ).toThrow();
    } finally {
      await pool.end();
    }
  });
  it("honors explicitly authored raw Experiences through the same standalone Auth boundary", async () => {
    const pool = createTestPool();
    await prepareExperienceTables(pool, schema);
    try {
      const auth = createBetterAuth({
        orm: drizzle(pool, { schema }),
        schema,
        services: {},
        app: { experiences: experienceConfig },
        options: {
          secret: SECRET,
          socialProviders: {
            google: { clientId: "test", clientSecret: "test" },
          },
          rateLimit: { enabled: false },
        },
      });
      const start = await auth.api.signInSocial({
        headers: new Headers({
          host: "horeka.example.test",
          origin: "https://horeka.example.test",
        }),
        body: { provider: "google" },
      });
      expect(new URL(start.url!).searchParams.get("redirect_uri")).toBe(
        "https://horeka.example.test/api/auth/callback/google"
      );
    } finally {
      await pool.end();
    }
  });
});
it("rejects mixed API protocols before a selected OAuth callback can inherit the default scheme", async () => {
  const pool = createTestPool();
  try {
    const experiences = {
      ...experienceConfig,
      definitions: {
        ...experienceConfig.definitions,
        horeka: {
          ...experienceConfig.definitions.horeka,
          webOrigin: "http://horeka.example.test",
          apiOrigin: "http://horeka.example.test",
        },
      },
    };
    expect(() =>
      createBetterAuth({
        orm: drizzle(pool, { schema }),
        schema,
        services: {},
        app: { experiences },
        options: {
          secret: SECRET,
          socialProviders: {
            google: { clientId: "test", clientSecret: "test" },
          },
        },
      })
    ).toThrow("Auth Experience API origins must use one protocol");
  } finally {
    await pool.end();
  }
});
