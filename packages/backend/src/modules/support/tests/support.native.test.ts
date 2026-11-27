import type { AddressInfo } from "node:net";
import { hashPassword } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
// A non-TypeScript client drives the same documented HTTP boundary as a native application.
// @ts-expect-error The runnable reference is deliberately plain JavaScript.
import { createSupportReferenceClient } from "../../../../../../scripts/support-native-reference.mjs";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import * as authTables from "../../auth/auth.db";
import { createBetterAuth } from "../../auth/auth.lib";
import { createAuthMiddleware } from "../../auth/auth.middleware";
import * as supportTables from "../support.db";
import { SupportRepository } from "../support.repository";
import { createSupportRouter } from "../support.router";
import { SupportService } from "../support.service";

it("runs a native reference client through real bearer login, Case sync and revocation", async () => {
  const pool = createTestPool();
  const schema = { ...authTables, ...supportTables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(authTables.users).values({
    id: "native",
    name: "Native User",
    email: "native@local.test",
    emailVerified: true,
    role: "user",
  });
  await orm.insert(authTables.accounts).values({
    id: "native-password",
    accountId: "native",
    userId: "native",
    providerId: "credential",
    password: await hashPassword("Native-Reference-Password-123"),
  });
  const app = express();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = createBetterAuth({
    orm,
    schema,
    services: {},
    app: { name: "Native fixture", urls: { api: baseUrl, web: baseUrl } },
    options: {
      secret: "native-reference-local-secret-at-least-thirty-two-characters",
      rateLimit: { enabled: false },
    },
  });
  const service = new SupportService({ support: new SupportRepository({ orm, schema }) }, {});
  app.all("/api/auth/{*path}", toNodeHandler(auth));
  app.use(express.json());
  app.use("/api/v1/support", createSupportRouter(service, createAuthMiddleware(auth)));
  try {
    const client = createSupportReferenceClient(baseUrl);
    await client.signIn("native@local.test", "Native-Reference-Password-123");
    const created = await client.call("createCase", {
      clientId: "native-request",
      subject: "Help from native",
      body: "Native request",
    });
    const read = await client.call("getCase", { id: created.id });
    expect(read.messages.map((message: { body: string }) => message.body)).toEqual([
      "Native request",
    ]);
    const sync = await client.call("sync", { id: created.id });
    expect(sync.messages[0].body).toBe("Native request");
    await client.call("markRead", { id: created.id, throughSequence: 1 });
    await client.signOut();
    await expect(client.call("getCase", { id: created.id })).rejects.toMatchObject({ status: 401 });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await pool.end();
  }
});
