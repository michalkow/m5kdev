import { drizzle } from "drizzle-orm/node-postgres";
import { createServiceActor } from "../../../base/base.actor";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { users } from "../../auth/auth.db";
import { taggings, tags } from "../../tag/tag.db";
import * as tables from "../support.db";
import { SupportRepository } from "../support.repository";
import { SupportService } from "../support.service";
import type { SupportConfig } from "../support.types";

const ctx = (userId: string, userRole = "user") => ({
  actor: createServiceActor({ userId, userRole }),
});
const user = ctx("user");
const staff = ctx("staff", "admin");
async function fixture(translation: NonNullable<SupportConfig["translation"]>) {
  const pool = createTestPool();
  const schema = { users, tags, taggings, ...tables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(users).values([
    { id: "user", name: "User", email: "user@local.test", emailVerified: true },
    { id: "staff", name: "Staff", email: "staff@local.test", emailVerified: true, role: "admin" },
  ]);
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    {},
    undefined,
    { locales: ["en", "pl", "de"], translation }
  );
  const settings = await support.saveSettings(
    {
      expectedVersion: 0,
      nativeLocales: ["en", "pl", "de"],
      fallbackLocale: "en",
      translation: {
        enabled: true,
        budget: {
          monthlyCalls: 8,
          dailyUserCalls: 8,
          maxInputCharacters: 20000,
          maxOutputCharacters: 20000,
          concurrency: 2,
          attempts: 1,
          timeoutMs: 5000,
        },
      },
      ai: { enabled: false },
    },
    staff
  );
  if (settings.isErr()) throw settings.error;
  return { support, pool };
}

it("publishes a held reply in the detected language when detection completes before its claim", async () => {
  const translated: string[] = [];
  const { support, pool } = await fixture({
    id: "local-outbound",
    languages: ["en", "pl", "de"],
    detect: async () => ({ locale: "de" }),
    translate: async ({ targetLocale }) => {
      translated.push(targetLocale);
      return { text: `${targetLocale}: Answer` };
    },
  });
  try {
    const created = await support.createCase(
      { clientId: "detected", subject: "Help", body: "Frage", uiLocale: "en" },
      user
    );
    if (created.isErr()) throw created.error;
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: "reply", body: "Answer", locale: "pl" },
      staff
    );
    if (sent.isErr()) throw sent.error;
    expect(sent.value.publishedAt).toBeNull();
    for (let sweep = 0; sweep < 5; sweep++) {
      const result = await support.processWork();
      if (result.isErr()) throw result.error;
    }
    const transcript = await support.getCase({ id: created.value.id }, user);
    if (transcript.isErr()) throw transcript.error;
    expect(transcript.value.messages.map((message) => message.publishedBody)).toEqual([
      "Frage",
      "de: Answer",
    ]);
    expect(translated).toEqual(["de"]);
    expect(transcript.value.case.unreadCount).toBe(1);
  } finally {
    await pool.end();
  }
});

it("replaces an in-flight translation after an explicit language change and publishes once", async () => {
  let entered = () => {};
  let release = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const translated: string[] = [];
  const { support, pool } = await fixture({
    id: "local-outbound",
    languages: ["en", "pl", "de"],
    translate: async ({ targetLocale }) => {
      translated.push(targetLocale);
      if (targetLocale === "pl") {
        entered();
        await gate;
      }
      return { text: `${targetLocale}: Answer` };
    },
  });
  try {
    const created = await support.createCase(
      { clientId: "changed", subject: "Help", body: "Pytanie", uiLocale: "pl" },
      user
    );
    if (created.isErr()) throw created.error;
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: "reply", body: "Answer", locale: "en" },
      staff
    );
    if (sent.isErr()) throw sent.error;
    const working = support.processWork();
    await started;
    const changed = await support.setLanguage({ id: created.value.id, locale: "de" }, user);
    if (changed.isErr()) throw changed.error;
    release();
    const finished = await working;
    if (finished.isErr()) throw finished.error;
    const during = await support.getCase({ id: created.value.id }, user);
    if (during.isErr()) throw during.error;
    expect(during.value.messages.map((message) => message.body)).toEqual(["Pytanie"]);
    for (let sweep = 0; sweep < 4; sweep++) {
      const result = await support.processWork();
      if (result.isErr()) throw result.error;
    }
    const transcript = await support.getCase({ id: created.value.id }, user);
    if (transcript.isErr()) throw transcript.error;
    expect(transcript.value.messages.map((message) => message.publishedBody)).toEqual([
      "Pytanie",
      "de: Answer",
    ]);
    expect(transcript.value.case.unreadCount).toBe(1);
    expect(translated).toEqual(["pl", "de"]);
  } finally {
    release();
    await pool.end();
  }
});

it.each([false, true])(
  "uses authored text when the new target matches, retaining preview consent (%s)",
  async (preview) => {
    let entered = () => {};
    let release = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const translated: string[] = [];
    const { support, pool } = await fixture({
      id: "local-outbound",
      languages: ["en", "pl", "de"],
      translate: async ({ targetLocale }) => {
        translated.push(targetLocale);
        entered();
        await gate;
        return { text: `${targetLocale}: Answer` };
      },
    });
    try {
      const created = await support.createCase(
        { clientId: "same-language", subject: "Help", body: "Pytanie", uiLocale: "pl" },
        user
      );
      if (created.isErr()) throw created.error;
      const sent = await support.sendMessage(
        { id: created.value.id, clientId: "reply", body: "Answer", locale: "en", preview },
        staff
      );
      if (sent.isErr()) throw sent.error;
      const working = support.processWork();
      await started;
      const changed = await support.setLanguage({ id: created.value.id, locale: "en" }, user);
      if (changed.isErr()) throw changed.error;
      release();
      const finished = await working;
      if (finished.isErr()) throw finished.error;
      for (let sweep = 0; sweep < 4; sweep++) {
        const result = await support.processWork();
        if (result.isErr()) throw result.error;
      }
      const desk = await support.getCase({ id: created.value.id }, staff);
      if (desk.isErr()) throw desk.error;
      expect(desk.value.messages[1].publishedBody).toBe("Answer");
      expect(desk.value.messages[1].translationState).toBe("ready");
      expect(Boolean(desk.value.messages[1].publishedAt)).toBe(!preview);
      if (preview) {
        const held = await support.getCase({ id: created.value.id }, user);
        if (held.isErr()) throw held.error;
        expect(held.value.messages.map((message) => message.body)).toEqual(["Pytanie"]);
        const approved = await support.controlMessage(
          { id: created.value.id, messageId: sent.value.id, action: "publish-preview" },
          staff
        );
        if (approved.isErr()) throw approved.error;
      }
      const transcript = await support.getCase({ id: created.value.id }, user);
      if (transcript.isErr()) throw transcript.error;
      expect(transcript.value.messages.map((message) => message.publishedBody)).toEqual([
        "Pytanie",
        "Answer",
      ]);
      expect(translated).toEqual(["pl"]);
    } finally {
      release();
      await pool.end();
    }
  }
);

it("invalidates a ready preview when detection changes its language and requires fresh approval", async () => {
  let detectedLocale = "pl";
  const { support, pool } = await fixture({
    id: "local-outbound",
    languages: ["en", "pl", "de"],
    detect: async () => ({ locale: detectedLocale }),
    translate: async ({ targetLocale }) => ({ text: `${targetLocale}: Answer` }),
  });
  try {
    const created = await support.createCase(
      { clientId: "preview", subject: "Help", body: "Frage", uiLocale: "pl" },
      user
    );
    if (created.isErr()) throw created.error;
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: "reply", body: "Answer", locale: "en", preview: true },
      staff
    );
    if (sent.isErr()) throw sent.error;
    for (let sweep = 0; sweep < 4; sweep++) await support.processWork();
    const preview = await support.getCase({ id: created.value.id }, staff);
    if (preview.isErr()) throw preview.error;
    expect(preview.value.messages[1].publishedBody).toBe("pl: Answer");
    detectedLocale = "de";
    const question = await support.sendMessage(
      { id: created.value.id, clientId: "next-question", body: "Noch eine Frage" },
      user
    );
    if (question.isErr()) throw question.error;
    const detection = await support.processWork();
    if (detection.isErr()) throw detection.error;
    const staleApproval = await support.controlMessage(
      { id: created.value.id, messageId: sent.value.id, action: "publish-preview" },
      staff
    );
    expect(staleApproval.isErr()).toBe(true);
    for (let sweep = 0; sweep < 4; sweep++) await support.processWork();
    const held = await support.getCase({ id: created.value.id }, user);
    if (held.isErr()) throw held.error;
    expect(held.value.messages.map((message) => message.body)).toEqual([
      "Frage",
      "Noch eine Frage",
    ]);
    const ready = await support.getCase({ id: created.value.id }, staff);
    if (ready.isErr()) throw ready.error;
    expect(ready.value.messages[1].publishedBody).toBe("de: Answer");
    const approved = await support.controlMessage(
      { id: created.value.id, messageId: sent.value.id, action: "publish-preview" },
      staff
    );
    if (approved.isErr()) throw approved.error;
    expect(approved.value.publishedBody).toBe("de: Answer");
  } finally {
    await pool.end();
  }
});

it("shows a held reply as failed when translation is disabled during the provider call", async () => {
  let entered = () => {};
  let release = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { support, pool } = await fixture({
    id: "local-outbound",
    languages: ["en", "pl", "de"],
    translate: async () => {
      entered();
      await gate;
      return { text: "PL: Answer" };
    },
  });
  try {
    const created = await support.createCase(
      { clientId: "disabled", subject: "Help", body: "Pytanie", uiLocale: "pl" },
      user
    );
    if (created.isErr()) throw created.error;
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: "reply", body: "Answer" },
      staff
    );
    if (sent.isErr()) throw sent.error;
    const working = support.processWork();
    await started;
    const settings = await support.getSettings({}, staff);
    if (settings.isErr()) throw settings.error;
    const disabled = await support.saveSettings(
      {
        ...settings.value,
        expectedVersion: settings.value.version,
        translation: { enabled: false },
      },
      staff
    );
    if (disabled.isErr()) throw disabled.error;
    release();
    const finished = await working;
    if (finished.isErr()) throw finished.error;
    const desk = await support.getCase({ id: created.value.id }, staff);
    if (desk.isErr()) throw desk.error;
    expect(desk.value.messages[1].translationState).toBe("failed");
    expect(desk.value.messages[1].publishedAt).toBeNull();
    const transcript = await support.getCase({ id: created.value.id }, user);
    if (transcript.isErr()) throw transcript.error;
    expect(transcript.value.messages.map((message) => message.body)).toEqual(["Pytanie"]);
  } finally {
    release();
    await pool.end();
  }
});

it("keeps the new preview ready when the superseded provider call finishes last", async () => {
  let entered = () => {};
  let release = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { support, pool } = await fixture({
    id: "local-outbound",
    languages: ["en", "pl", "de"],
    translate: async ({ targetLocale }) => {
      if (targetLocale === "pl") {
        entered();
        await gate;
      }
      return { text: `${targetLocale}: Answer` };
    },
  });
  try {
    const created = await support.createCase(
      { clientId: "reverse-order", subject: "Help", body: "Pytanie", uiLocale: "pl" },
      user
    );
    if (created.isErr()) throw created.error;
    const sent = await support.sendMessage(
      { id: created.value.id, clientId: "reply", body: "Answer", preview: true },
      staff
    );
    if (sent.isErr()) throw sent.error;
    const working = support.processWork();
    await started;
    const changed = await support.setLanguage({ id: created.value.id, locale: "de" }, user);
    if (changed.isErr()) throw changed.error;
    const replacement = await support.processWork();
    if (replacement.isErr()) throw replacement.error;
    release();
    const finished = await working;
    if (finished.isErr()) throw finished.error;
    const desk = await support.getCase({ id: created.value.id }, staff);
    if (desk.isErr()) throw desk.error;
    expect(desk.value.messages[1].publishedBody).toBe("de: Answer");
    expect(desk.value.messages[1].translationState).toBe("ready");
    const approval = {
      id: created.value.id,
      messageId: sent.value.id,
      action: "publish-preview" as const,
    };
    for (let retry = 0; retry < 2; retry++) {
      const approved = await support.controlMessage(approval, staff);
      if (approved.isErr()) throw approved.error;
      expect(approved.value.publishedBody).toBe("de: Answer");
    }
    const changes = await support.sync({ id: created.value.id }, user);
    if (changes.isErr()) throw changes.error;
    expect(
      changes.value.changes.filter((change) => change.type === "message.published")
    ).toHaveLength(1);
    expect(changes.value.case.unreadCount).toBe(1);
  } finally {
    release();
    await pool.end();
  }
});
