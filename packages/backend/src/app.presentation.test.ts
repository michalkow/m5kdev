import { createBackendApp } from "./app";
import { ExperienceRegistry } from "./experience";
import { experienceConfig } from "./test/experience.fixtures";
import { createTestPool } from "./test/postgresql";

describe("Public app presentation composition", () => {
  it("rejects conflicting authored identity and a resolved-only registry instead of ignoring them", async () => {
    const pool = createTestPool();
    try {
      for (const extra of [{ name: "" }, { urls: {} }, { brand: {} }, { name: undefined }])
        expect(() =>
          createBackendApp({
            db: { client: pool },
            app: { experiences: experienceConfig, ...extra } as never,
          })
        ).toThrow(/mix/);
      expect(() =>
        createBackendApp({
          db: { client: pool },
          app: {
            experienceRegistry: new ExperienceRegistry(experienceConfig),
          } as never,
        })
      ).toThrow(/resolved.*app.experiences/);
    } finally {
      await pool.end();
    }
  });
  it("states the origin-only Kernel contract while preserving ordinary shorthand and root-slash URLs", async () => {
    const pool = createTestPool();
    try {
      expect(() =>
        createBackendApp({
          db: { client: pool },
          app: {
            urls: {
              web: "https://web.example.test",
              api: "https://api.example.test/prefix",
            },
          },
        })
      ).toThrow(/app.urls.api.*origin/);
      const built = createBackendApp({
        db: { client: pool },
        app: {
          name: "Authored Name",
          urls: {
            web: "https://web.example.test/",
            api: "https://api.example.test/",
          },
        },
      });
      expect(built.config.app.experienceRegistry?.defaultExperience).toMatchObject({
        brand: { name: "Authored Name" },
        webOrigin: "https://web.example.test",
        apiOrigin: "https://api.example.test",
      });
      await built.shutdown();
    } finally {
      await pool.end();
    }
  });
});
