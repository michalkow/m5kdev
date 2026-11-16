import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { ExperienceRegistry } from "../../../experience";
import { experienceConfig, prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import * as schema from "../auth.db";
import { createBetterAuth } from "../auth.lib";

describe("Experience-bound authentication", () => {
  it("starts sign-in on the entered domain and rejects a different brand callback", async () => {
    const client = createTestPool();
    await prepareExperienceTables(client, schema);
    const registry = new ExperienceRegistry(experienceConfig);
    const auth = createBetterAuth({
      orm: drizzle(client, { schema }),
      schema,
      services: {},
      app: {
        name: "Default",
        urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
        experienceRegistry: registry,
      },
      options: {
        secret: "experience-test-secret-at-least-thirty-two-characters",
        socialProviders: { google: { clientId: "test-client", clientSecret: "test-secret" } },
        rateLimit: { enabled: false },
      },
    });
    try {
      const response = await auth.handler(
        new Request("https://horeka.example.test/api/auth/sign-in/social", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://horeka.example.test",
            host: "horeka.example.test",
          },
          body: JSON.stringify({
            provider: "google",
            callbackURL: "https://horeka.example.test/conversation",
          }),
        })
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      const provider = new URL(result.url);
      expect(provider.searchParams.get("redirect_uri")).toBe(
        "https://horeka.example.test/api/auth/callback/google"
      );
      expect(response.headers.get("set-cookie")).not.toMatch(/Domain=/i);
      const rejected = await auth.handler(
        new Request("https://horeka.example.test/api/auth/sign-in/social", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://horeka.example.test",
            host: "horeka.example.test",
          },
          body: JSON.stringify({
            provider: "google",
            callbackURL: "https://radar.example.test/posts",
          }),
        })
      );
      expect(rejected.status).toBe(400);
      await expect(
        auth.api.signInSocial({
          headers: new Headers({
            host: "horeka.example.test",
            origin: "https://horeka.example.test",
          }),
          body: { provider: "google", callbackURL: "https://radar.example.test/posts" },
        })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    } finally {
      await client.end();
    }
  });
  it("creates separate host-only sessions for a shared User on both domains", async () => {
    const client = createTestPool();
    await prepareExperienceTables(client, schema);
    const orm = drizzle(client, { schema });
    await orm
      .insert(schema.users)
      .values({
        id: "shared-person",
        name: "Shared Person",
        email: "shared@example.test",
        emailVerified: true,
        role: "user",
      });
    await orm
      .insert(schema.accounts)
      .values({
        id: "credential",
        accountId: "shared-person",
        providerId: "credential",
        userId: "shared-person",
        password: await hashPassword("Valid-Example-Password-123"),
      });
    const auth = createBetterAuth({
      orm,
      schema,
      services: {},
      app: {
        urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
        experienceRegistry: new ExperienceRegistry(experienceConfig),
      },
      options: {
        secret: "experience-test-secret-at-least-thirty-two-characters",
        rateLimit: { enabled: false },
      },
    });
    try {
      const tokens: string[] = [];
      for (const host of ["radar.example.test", "horeka.example.test"]) {
        const response = await auth.handler(
          new Request(`https://${host}/api/auth/sign-in/email`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: `https://${host}`, host },
            body: JSON.stringify({
              email: "shared@example.test",
              password: "Valid-Example-Password-123",
              callbackURL: "/posts",
            }),
          })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user.id).toBe("shared-person");
        expect(data.url).toBe(`https://${host}/posts`);
        expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
        expect(response.headers.get("set-cookie")).not.toMatch(/Domain=/i);
        tokens.push(data.token);
      }
      expect(tokens[0]).not.toBe(tokens[1]);
    } finally {
      await client.end();
    }
  });
});
