import type { AddressInfo } from "node:net";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import { createServiceActor } from "../../../base/base.actor";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { users } from "../../auth/auth.db";
import type { AuthMiddleware } from "../../auth/auth.middleware";
import * as tables from "../support.db";
import { SupportRepository } from "../support.repository";
import { createSupportRouter } from "../support.router";
import { SupportService } from "../support.service";

const schema = { users, ...tables };
const pool = createTestPool();
const orm = drizzle(pool, { schema });
const support = new SupportService({ support: new SupportRepository({ orm, schema }) }, {});
const ctx = (userId: string, userRole = "user") => ({
  actor: createServiceActor({ userId, userRole }),
});

beforeAll(async () => {
  await prepareExperienceTables(pool, schema);
  await orm.insert(users).values([
    { id: "alice", name: "Alice", email: "alice@local.test", emailVerified: true },
    { id: "bob", name: "Bob", email: "bob@local.test", emailVerified: true },
    { id: "staff", name: "Staff", email: "staff@local.test", emailVerified: true, role: "admin" },
  ]);
});
afterAll(() => pool.end());

it("makes a first support request retrievable without an Organization", async () => {
  const created = await support.createCase(
    { clientId: "create-1", subject: "Billing help", body: "My invoice is wrong" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  const read = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (read.isErr()) throw read.error;
  expect(read.value.case.userId).toBe("alice");
  expect(read.value.messages.map((message) => message.body)).toEqual(["My invoice is wrong"]);
});

it("rejects reusing a Case request identity with different content", async () => {
  const input = { clientId: "conflict-1", subject: "Help", body: "First request" };
  const first = await support.createCase(input, ctx("alice"));
  if (first.isErr()) throw first.error;
  const retry = await support.createCase(input, ctx("alice"));
  if (retry.isErr()) throw retry.error;
  expect(retry.value.id).toBe(first.value.id);
  const conflict = await support.createCase({ ...input, body: "Different request" }, ctx("alice"));
  expect(conflict.isErr() && conflict.error.code).toBe("CONFLICT");
});

it("keeps personal support private while allowing platform support to reply", async () => {
  const created = await support.createCase(
    { clientId: "private", subject: "Private billing", body: "Sensitive details" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  const denied = await support.getCase({ id: created.value.id }, ctx("bob"));
  expect(denied.isErr() && denied.error.code).toBe("FORBIDDEN");
  const spoof = await support.createCase(
    { clientId: "spoof", subject: "Spoof", body: "Cannot send as Alice", userId: "alice" },
    ctx("bob")
  );
  expect(spoof.isErr() && spoof.error.code).toBe("FORBIDDEN");
  const reply = { id: created.value.id, clientId: "staff-reply", body: "We can help" };
  const sent = await support.sendMessage(reply, ctx("staff", "admin"));
  const retry = await support.sendMessage(reply, ctx("staff", "admin"));
  if (sent.isErr()) throw sent.error;
  if (retry.isErr()) throw retry.error;
  expect(retry.value.id).toBe(sent.value.id);
  const read = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (read.isErr()) throw read.error;
  expect(read.value.messages.map((message) => [message.sequence, message.body])).toEqual([
    [1, "Sensitive details"],
    [2, "We can help"],
  ]);
  expect(read.value.case).not.toHaveProperty("requestHash");
});

it("enforces the same private Case boundary on the JSON HTTP interface", async () => {
  // Authentication is a synthetic system boundary here; real bearer auth has its own slice.
  const auth: AuthMiddleware = (req, res, next) => {
    const id = req.get("x-test-user");
    if (!id) {
      res.sendStatus(401);
      return;
    }
    req.user = { id, role: id === "staff" ? "admin" : "user" } as NonNullable<typeof req.user>;
    req.session = { id: `session-${id}`, userId: id } as NonNullable<typeof req.session>;
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1/support", createSupportRouter(support, auth));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/support`;
  try {
    const created = await fetch(`${base}/cases`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "alice" },
      body: JSON.stringify({
        clientId: "http-create",
        subject: "HTTP help",
        body: "Private HTTP details",
      }),
    });
    expect(created.status).toBe(200);
    const record = await created.json();
    expect(record).not.toHaveProperty("requestHash");
    const denied = await fetch(`${base}/cases/${record.id}`, { headers: { "x-test-user": "bob" } });
    expect(denied.status).toBe(403);
    expect(await fetch(`${base}/cases`).then((response) => response.status)).toBe(401);
    const reply = await fetch(`${base}/cases/${record.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "staff" },
      body: JSON.stringify({ clientId: "http-reply", body: "HTTP staff reply" }),
    });
    expect(reply.status).toBe(200);
    const read = await fetch(`${base}/cases/${record.id}`, {
      headers: { "x-test-user": "alice" },
    }).then((response) => response.json());
    expect(read.messages.map((message: { body: string }) => message.body)).toEqual([
      "Private HTTP details",
      "HTTP staff reply",
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
