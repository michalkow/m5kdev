import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import * as schema from "../auth.db";
import { createBetterAuth } from "../auth.lib";

it("signs in a native User and rejects the same bearer session after logout", async () => {
  const pool = createTestPool();
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(schema.users).values({
    id: "native-user",
    name: "Native",
    email: "native@local.test",
    emailVerified: true,
    role: "user",
  });
  await orm.insert(schema.accounts).values({
    id: "native-credential",
    accountId: "native-user",
    userId: "native-user",
    providerId: "credential",
    password: await hashPassword("Native-Example-Password-123"),
  });
  const auth = createBetterAuth({
    orm,
    schema,
    services: {},
    app: { name: "Local", urls: { web: "http://localhost:8080", api: "http://localhost:8080" } },
    options: {
      secret: "local-native-test-secret-at-least-thirty-two-characters",
      rateLimit: { enabled: false },
    },
  });
  try {
    const login = await auth.handler(
      new Request("http://localhost:8080/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:8080" },
        body: JSON.stringify({
          email: "native@local.test",
          password: "Native-Example-Password-123",
        }),
      })
    );
    expect(login.status).toBe(200);
    const token = login.headers.get("set-auth-token");
    expect(typeof token === "string" && token.includes(".")).toBe(true);
    const headers = new Headers({ authorization: `Bearer ${token}` });
    const active = await auth.api.getSession({ headers });
    expect(active?.user.id).toBe("native-user");
    expect(
      await auth.api.getSession({ headers: new Headers({ authorization: "Bearer forged" }) })
    ).toBeNull();
    const logout = await auth.handler(
      new Request("http://localhost:8080/api/auth/sign-out", { method: "POST", headers })
    );
    expect(logout.status).toBe(200);
    expect(await auth.api.getSession({ headers })).toBeNull();
  } finally {
    await pool.end();
  }
});
