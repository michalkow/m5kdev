import { drizzle } from "drizzle-orm/node-postgres";
import { createServiceActor } from "../../../base/base.actor";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { users } from "../../auth/auth.db";
import { taggings, tags } from "../../tag/tag.db";
import * as tables from "../support.db";
import { SupportRepository } from "../support.repository";
import { SupportService } from "../support.service";

const ctx = (userId: string, userRole = "user") => ({
  actor: createServiceActor({ userId, userRole }),
});
it("holds failed translation and publishes the exact successful rendition on explicit retry", async () => {
  const pool = createTestPool();
  const schema = { users, tags, taggings, ...tables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(users).values([
    { id: "user", name: "User", email: "user@local.test", emailVerified: true },
    { id: "staff", name: "Staff", email: "staff@local.test", emailVerified: true, role: "admin" },
  ]);
  let unavailable = true;
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    {},
    undefined,
    {
      locales: ["en", "pl"],
      translation: {
        id: "local-fixture",
        languages: ["en", "pl"],
        translate: async ({ text }: { text: string }) => {
          if (unavailable) throw new Error("Unavailable");
          return { text: `PL: ${text}` };
        },
      },
    }
  );
  try {
    const settings = await support.saveSettings(
      {
        expectedVersion: 0,
        nativeLocales: ["en", "pl"],
        fallbackLocale: "en",
        translation: {
          enabled: true,
          budget: {
            monthlyCalls: 4,
            dailyUserCalls: 4,
            maxInputCharacters: 20000,
            maxOutputCharacters: 20000,
            concurrency: 1,
            attempts: 1,
            timeoutMs: 5000,
          },
        },
        ai: { enabled: false },
      },
      ctx("staff", "admin")
    );
    if (settings.isErr()) throw settings.error;
    const created = await support.createCase(
      { clientId: "translate", subject: "Pomoc", body: "Pytanie", uiLocale: "pl" },
      ctx("user")
    );
    if (created.isErr()) throw created.error;
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: "translate-reply", body: "Answer" },
      ctx("staff", "admin")
    );
    if (sent.isErr()) throw sent.error;
    expect(sent.value.publishedAt).toBeNull();
    await support.processWork();
    const held = await support.getCase({ id: created.value.id }, ctx("user"));
    if (held.isErr()) throw held.error;
    expect(held.value.messages.map((message) => message.body)).toEqual(["Pytanie"]);
    unavailable = false;
    const retry = await support.controlMessage(
      { id: created.value.id, messageId: sent.value.id, action: "retry" },
      ctx("staff", "admin")
    );
    if (retry.isErr()) throw retry.error;
    await support.processWork();
    const published = await support.getCase({ id: created.value.id }, ctx("user"));
    if (published.isErr()) throw published.error;
    expect(published.value.messages[1].publishedBody).toBe("PL: Answer");
    expect(published.value.messages[1].body).toBe("Answer");
    expect(published.value.messages[1].publishedAt).not.toBeNull();
  } finally {
    await pool.end();
  }
});

it("stops automation at the persisted allowance while preserving human send-original", async () => {
  const pool = createTestPool();
  const schema = { users, tags, taggings, ...tables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(users).values([
    { id: "user", name: "User", email: "user@local.test", emailVerified: true },
    { id: "staff", name: "Staff", email: "staff@local.test", emailVerified: true, role: "admin" },
  ]);
  let calls = 0;
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    {},
    undefined,
    {
      locales: ["en", "pl"],
      translation: {
        id: "local-cap",
        languages: ["en", "pl"],
        translate: async () => {
          calls++;
          return { text: "Przetłumaczono" };
        },
      },
    }
  );
  try {
    const settings = await support.saveSettings(
      {
        expectedVersion: 0,
        nativeLocales: ["en", "pl"],
        fallbackLocale: "en",
        translation: {
          enabled: true,
          budget: {
            monthlyCalls: 1,
            dailyUserCalls: 1,
            maxInputCharacters: 20000,
            maxOutputCharacters: 20000,
            concurrency: 1,
            attempts: 1,
            timeoutMs: 5000,
          },
        },
        ai: { enabled: false },
      },
      ctx("staff", "admin")
    );
    if (settings.isErr()) throw settings.error;
    const created = await support.createCase(
      { clientId: "cap", subject: "Limit", body: "Pytanie", uiLocale: "pl" },
      ctx("user")
    );
    if (created.isErr()) throw created.error;
    const first = await support.sendMessage(
      { id: created.value.id, clientId: "one", body: "One" },
      ctx("staff", "admin")
    );
    if (first.isErr()) throw first.error;
    const second = await support.sendMessage(
      { id: created.value.id, clientId: "two", body: "Two" },
      ctx("staff", "admin")
    );
    if (second.isErr()) throw second.error;
    await support.processWork();
    await support.processWork();
    expect(calls).toBe(1);
    const held = await support.getCase({ id: created.value.id }, ctx("staff", "admin"));
    if (held.isErr()) throw held.error;
    expect(held.value.messages[2].translationState).toBe("failed");
    const sent = await support.controlMessage(
      { id: created.value.id, messageId: second.value.id, action: "send-original" },
      ctx("staff", "admin")
    );
    if (sent.isErr()) throw sent.error;
    expect(sent.value.publishedBody).toBe("Two");
  } finally {
    await pool.end();
  }
});
