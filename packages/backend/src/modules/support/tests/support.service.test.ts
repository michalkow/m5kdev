import type { AddressInfo } from "node:net";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import { createServiceActor } from "../../../base/base.actor";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { createTRPCMethods } from "../../../utils/trpc";
import { users } from "../../auth/auth.db";
import type { AuthMiddleware } from "../../auth/auth.middleware";
import { taggings, tags } from "../../tag/tag.db";
import * as tables from "../support.db";
import { SupportRepository } from "../support.repository";
import { createSupportRouter } from "../support.router";
import { SupportService } from "../support.service";
import { createSupportTRPC } from "../support.trpc";

const schema = { users, tags, taggings, ...tables };
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

it("recovers committed changes and keeps read state monotonic", async () => {
  const created = await support.createCase(
    { clientId: "read-case", subject: "Unread", body: "Question" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  const initial = await support.sync({ id: created.value.id, limit: 20 }, ctx("alice"));
  if (initial.isErr()) throw initial.error;
  const reply = await support.sendMessage(
    { id: created.value.id, clientId: "unread-reply", body: "Reply while offline" },
    ctx("staff", "admin")
  );
  if (reply.isErr()) throw reply.error;
  const tail = await support.sync(
    { id: created.value.id, cursor: initial.value.cursor, limit: 20 },
    ctx("alice")
  );
  if (tail.isErr()) throw tail.error;
  expect(tail.value.messages.map((message) => message.body)).toEqual(["Reply while offline"]);
  expect(tail.value.case.unreadCount).toBe(1);
  const unread = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (unread.isErr()) throw unread.error;
  expect(unread.value.case.unreadCount).toBe(1);
  const badge = await support.getUnreadCount({}, ctx("alice"));
  if (badge.isErr()) throw badge.error;
  expect(badge.value.count).toBe(1);
  const marked = await support.markRead(
    { id: created.value.id, throughSequence: reply.value.sequence },
    ctx("alice")
  );
  if (marked.isErr()) throw marked.error;
  await support.markRead({ id: created.value.id, throughSequence: 1 }, ctx("alice"));
  const read = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (read.isErr()) throw read.error;
  expect(read.value.case.unreadCount).toBe(0);
  const cleared = await support.getUnreadCount({}, ctx("alice"));
  if (cleared.isErr()) throw cleared.error;
  expect(cleared.value.count).toBe(0);
});

it("pages history without gaps and rejects cross-Case cursors", async () => {
  const created = await support.createCase(
    { clientId: "pages", subject: "Pages", body: "One" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  for (const body of ["Two", "Three", "Four"]) {
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: body, body },
      ctx("alice")
    );
    if (sent.isErr()) throw sent.error;
  }
  const latest = await support.getCase({ id: created.value.id, limit: 2 }, ctx("alice"));
  if (latest.isErr()) throw latest.error;
  expect(latest.value.messages.map((message) => message.body)).toEqual(["Three", "Four"]);
  expect(latest.value.hasOlder).toBe(true);
  const older = await support.getCase(
    { id: created.value.id, limit: 2, beforeSequence: 3 },
    ctx("alice")
  );
  if (older.isErr()) throw older.error;
  expect(older.value.messages.map((message) => message.body)).toEqual(["One", "Two"]);
  expect(older.value.hasOlder).toBe(false);
  const wrong = await support.sync(
    {
      id: created.value.id,
      cursor: Buffer.from(JSON.stringify({ id: "another", sequence: 0 })).toString("base64url"),
    },
    ctx("alice")
  );
  expect(wrong.isErr() && wrong.error.code).toBe("BAD_REQUEST");
});

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
    const contract = await fetch(`${base}/openapi.json`, {
      headers: { "x-test-user": "alice" },
    }).then((response) => response.json());
    const operationIds = Object.values(contract.paths).flatMap((methods) =>
      Object.values(methods as Record<string, { operationId: string }>).map(
        (operation) => operation.operationId
      )
    );
    const trpc = createSupportTRPC(createTRPCMethods(), support);
    expect(operationIds.sort()).toEqual(Object.keys(trpc._def.procedures).sort());
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

it("keeps notes private and reopens a resolved cycle without losing human takeover", async () => {
  const created = await support.createCase(
    { clientId: "workflow", subject: "Lifecycle", body: "Question" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  const resolved = await support.updateCase(
    { id: created.value.id, expectedVersion: created.value.version, status: "resolved" },
    ctx("alice")
  );
  if (resolved.isErr()) throw resolved.error;
  const note = await support.sendMessage(
    { id: created.value.id, clientId: "note", body: "Staff secret", visibility: "internal" },
    ctx("staff", "admin")
  );
  if (note.isErr()) throw note.error;
  const customer = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (customer.isErr()) throw customer.error;
  expect(customer.value.messages.map((message) => message.body)).toEqual(["Question"]);
  expect(customer.value.case.status).toBe("resolved");
  const reopened = await support.sendMessage(
    { id: created.value.id, clientId: "reopen", body: "Still need help" },
    ctx("alice")
  );
  if (reopened.isErr()) throw reopened.error;
  const view = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (view.isErr()) throw view.error;
  expect([
    view.value.case.status,
    view.value.case.cycle,
    view.value.case.waitingOn,
    view.value.case.handling,
  ]).toEqual(["open", 2, "support", "human"]);
  const stale = await support.updateCase(
    { id: created.value.id, expectedVersion: 1, priority: "urgent" },
    ctx("staff", "admin")
  );
  expect(stale.isErr() && stale.error.code).toBe("CONFLICT");
  const sync = await support.sync({ id: created.value.id }, ctx("alice"));
  if (sync.isErr()) throw sync.error;
  expect(JSON.stringify(sync.value)).not.toContain("Staff secret");
});

it("shares only the Support catalog and ignores a snooze after resolution", async () => {
  const denied = await support.saveCatalog({ kind: "tag", name: "Private?" }, ctx("alice"));
  expect(denied.isErr() && denied.error.code).toBe("FORBIDDEN");
  const saved = await support.saveCatalog({ kind: "tag", name: "Billing" }, ctx("staff", "admin"));
  if (saved.isErr()) throw saved.error;
  const tagId = saved.value.tags.find((tag) => tag.name === "Billing")?.id;
  expect(typeof tagId).toBe("string");
  const created = await support.createCase(
    { clientId: "snooze", subject: "Timer", body: "Question" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  const assigned = await support.updateCase(
    { id: created.value.id, expectedVersion: 1, assignedUserId: "bob" },
    ctx("staff", "admin")
  );
  expect(assigned.isErr() && assigned.error.code).toBe("BAD_REQUEST");
  const snoozed = await support.updateCase(
    { id: created.value.id, expectedVersion: 1, snoozedUntil: new Date(Date.now() + 60000) },
    ctx("staff", "admin")
  );
  if (snoozed.isErr()) throw snoozed.error;
  const resolved = await support.updateCase(
    { id: created.value.id, expectedVersion: snoozed.value.version, status: "resolved" },
    ctx("alice")
  );
  if (resolved.isErr()) throw resolved.error;
  const wake = await support.wakeSnoozed(new Date(Date.now() + 120000));
  if (wake.isErr()) throw wake.error;
  const view = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (view.isErr()) throw view.error;
  expect(view.value.case.status).toBe("resolved");
});

it("offers editable one-click feedback only for a genuine resolved cycle", async () => {
  const settings = await support.saveSettings(
    {
      expectedVersion: 0,
      nativeLocales: ["en"],
      fallbackLocale: "en",
      translation: { enabled: false },
      ai: { enabled: false },
      csatEnabled: true,
    },
    ctx("staff", "admin")
  );
  if (settings.isErr()) throw settings.error;
  const created = await support.createCase(
    { clientId: "feedback", subject: "Feedback", body: "Question" },
    ctx("alice")
  );
  if (created.isErr()) throw created.error;
  const resolved = await support.updateCase(
    { id: created.value.id, expectedVersion: 1, status: "resolved" },
    ctx("alice")
  );
  if (resolved.isErr()) throw resolved.error;
  const unavailable = await support.rate(
    { id: created.value.id, cycle: 1, score: 1 },
    ctx("alice")
  );
  expect(unavailable.isErr() && unavailable.error.code).toBe("BAD_REQUEST");
  await support.sendMessage(
    { id: created.value.id, clientId: "feedback-reopen", body: "Need help" },
    ctx("alice")
  );
  await support.sendMessage(
    { id: created.value.id, clientId: "feedback-answer", body: "Answer" },
    ctx("staff", "admin")
  );
  const view = await support.getCase({ id: created.value.id }, ctx("alice"));
  if (view.isErr()) throw view.error;
  const done = await support.updateCase(
    { id: created.value.id, expectedVersion: view.value.case.version, status: "resolved" },
    ctx("alice")
  );
  if (done.isErr()) throw done.error;
  const rated = await support.rate({ id: created.value.id, cycle: 2, score: 1 }, ctx("alice"));
  if (rated.isErr()) throw rated.error;
  const edited = await support.rate({ id: created.value.id, cycle: 2, score: 0 }, ctx("alice"));
  if (edited.isErr()) throw edited.error;
  const overview = await support.overview({}, ctx("staff", "admin"));
  if (overview.isErr()) throw overview.error;
  expect(overview.value.csat.human).toEqual({ samples: 1, positive: 0 });
  await support.sendMessage(
    { id: created.value.id, clientId: "feedback-again", body: "Another question" },
    ctx("alice")
  );
  const stale = await support.rate({ id: created.value.id, cycle: 2, score: 1 }, ctx("alice"));
  expect(stale.isErr() && stale.error.code).toBe("CONFLICT");
});

it("pages the complete private Case list", async () => {
  for (let index = 0; index < 3; index++) {
    const result = await support.createCase(
      { clientId: `case-page-${index}`, subject: "Paging cohort", body: String(index) },
      ctx("alice")
    );
    if (result.isErr()) throw result.error;
  }
  const first = await support.listCases({ limit: 2, search: "Paging cohort" }, ctx("alice"));
  if (first.isErr()) throw first.error;
  expect(first.value.items).toHaveLength(2);
  expect(first.value.cursor).not.toBeNull();
  const next = await support.listCases(
    { limit: 2, search: "Paging cohort", cursor: first.value.cursor ?? undefined },
    ctx("alice")
  );
  if (next.isErr()) throw next.error;
  expect(next.value.items).toHaveLength(1);
  expect(next.value.cursor).toBeNull();
  expect(new Set([...first.value.items, ...next.value.items].map((row) => row.id)).size).toBe(3);
});
