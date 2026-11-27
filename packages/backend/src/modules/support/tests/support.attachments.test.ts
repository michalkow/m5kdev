import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import { createServiceActor } from "../../../base/base.actor";
import { prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { users } from "../../auth/auth.db";
import { files } from "../../file/file.db";
import { defaultFileGrants } from "../../file/file.grants";
import { LocalFileObjectStore } from "../../file/file.local-store";
import { createMockS3Router } from "../../file/file.mock-s3.router";
import { FileRepository } from "../../file/file.repository";
import { FileService } from "../../file/file.service";
import { taggings, tags } from "../../tag/tag.db";
import * as supportTables from "../support.db";
import { SupportRepository } from "../support.repository";
import { SupportService } from "../support.service";

const ctx = (userId: string, userRole = "user") => ({
  actor: createServiceActor({ userId, userRole }),
});
it("shares sealed staff Files only with the Case participant and removes issued links on redaction", async () => {
  const pool = createTestPool();
  const schema = { users, files, tags, taggings, ...supportTables };
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  await orm.insert(users).values([
    { id: "user", name: "User", emailVerified: true, email: "user@test.local" },
    { id: "other", name: "Other", emailVerified: true, email: "other@test.local" },
    { id: "staff", name: "Staff", emailVerified: true, email: "staff@test.local", role: "admin" },
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "support-files-"));
  const app = express();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const store = new LocalFileObjectStore({ root, publicBaseUrl: origin, defaultBucket: "local" });
  app.use("/file-s3-mock", createMockS3Router(store));
  const file = new FileService(
    { file: new FileRepository({ orm, schema }), fileS3: store },
    {},
    defaultFileGrants,
    { buckets: ["local"] }
  );
  let enteredTranslation = () => {};
  let releaseTranslation = () => {};
  const translationStarted = new Promise<void>((resolve) => {
    enteredTranslation = resolve;
  });
  const translationGate = new Promise<void>((resolve) => {
    releaseTranslation = resolve;
  });
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    { file },
    undefined,
    {
      maxFileBytes: 8,
      locales: ["en", "pl", "de"],
      translation: {
        id: "local-files",
        languages: ["en", "pl", "de"],
        translate: async ({ targetLocale }) => {
          if (targetLocale === "pl") {
            enteredTranslation();
            await translationGate;
          }
          return { text: `${targetLocale}: See attached` };
        },
      },
    }
  );
  try {
    const created = await support.createCase(
      { clientId: "files", subject: "Attachment", body: "Help" },
      ctx("user")
    );
    if (created.isErr()) throw created.error;
    const upload = await support.initiateAttachment(
      { id: created.value.id, originalName: "answer.txt", contentType: "text/plain", sizeBytes: 5 },
      ctx("staff", "admin")
    );
    if (upload.isErr()) throw upload.error;
    expect(
      (
        await fetch(upload.value.url, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: "Hello",
        })
      ).status
    ).toBe(200);
    // Simulate a process disappearing after object bytes land, before DB finalization.
    const putObject = store.putS3Object.bind(store);
    let interruptedKey = "";
    const interruptedWrite = jest
      .spyOn(store, "putS3Object")
      .mockImplementationOnce(async (...args) => {
        interruptedKey = args[0];
        const result = await putObject(...args);
        if (result.isErr()) throw result.error;
        throw new Error("simulated process loss after object write");
      });
    const interrupted = await support.sendMessage(
      {
        id: created.value.id,
        clientId: "answer",
        body: "See attached",
        attachmentIds: [upload.value.fileId],
      },
      ctx("staff", "admin")
    );
    expect(interrupted.isErr()).toBe(true);
    interruptedWrite.mockRestore();
    const resumedWrites = jest.spyOn(store, "putS3Object");
    const message = await support.sendMessage(
      {
        id: created.value.id,
        clientId: "answer",
        body: "See attached",
        attachmentIds: [upload.value.fileId],
      },
      ctx("staff", "admin")
    );
    if (message.isErr()) throw message.error;
    expect(resumedWrites.mock.calls.map((args) => args[0])).toEqual([interruptedKey]);
    resumedWrites.mockRestore();

    for (const stage of ["before-write", "after-write"]) {
      for (const recovery of ["retry", "purge"]) {
        const interrupted = await file.initiateSharedUpload({
          originalName: "interrupted.txt",
          contentType: "text/plain",
          sizeBytes: 5,
          userId: "staff",
        });
        if (interrupted.isErr()) throw interrupted.error;
        await fetch(interrupted.value.url, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: "Hello",
        });
        let intendedKey = "";
        const originalPut = store.putS3Object.bind(store);
        const crash = jest.spyOn(store, "putS3Object").mockImplementationOnce(async (...args) => {
          intendedKey = args[0];
          if (stage === "after-write") {
            const written = await originalPut(...args);
            if (written.isErr()) throw written.error;
          }
          throw new Error(`Process interrupted ${stage}`);
        });
        await expect(file.sealForSharing(interrupted.value.fileId, "staff", 8)).rejects.toThrow(
          `Process interrupted ${stage}`
        );
        crash.mockRestore();
        const genericDelete = await file.delete(
          { fileId: interrupted.value.fileId },
          ctx("staff", "admin")
        );
        expect(genericDelete.isErr() && genericDelete.error.code).toBe("FORBIDDEN");
        const targetUrl = `${origin}/file-s3-mock/local/${intendedKey}`;
        if (recovery === "retry") {
          const retried = await file.sealForSharing(interrupted.value.fileId, "staff", 8);
          if (retried.isErr()) throw retried.error;
          const shared = await file.sharedDownload(interrupted.value.fileId);
          if (shared.isErr()) throw shared.error;
          expect(shared.value.url).toBe(targetUrl);
          expect(await fetch(shared.value.url).then((response) => response.text())).toBe("Hello");
        }
        await file.purgeSharedFile(interrupted.value.fileId);
        expect((await fetch(interrupted.value.url)).status).toBe(404);
        expect((await fetch(targetUrl)).status).toBe(404);
      }
    }
    const invalid = await support.initiateAttachment(
      { id: created.value.id, originalName: "fake.png", contentType: "image/png", sizeBytes: 5 },
      ctx("staff", "admin")
    );
    if (invalid.isErr()) throw invalid.error;
    await fetch(invalid.value.url, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: "Hello",
    });
    const rejected = await support.sendMessage(
      {
        id: created.value.id,
        clientId: "fake",
        body: "Invalid",
        attachmentIds: [invalid.value.fileId],
      },
      ctx("staff", "admin")
    );
    expect(rejected.isErr()).toBe(true);
    const bypass = await file.getDownloadUrl(
      { fileId: upload.value.fileId },
      ctx("staff", "admin")
    );
    expect(bypass.isErr() && bypass.error.code).toBe("FORBIDDEN");
    const oversized = await support.initiateAttachment(
      {
        id: created.value.id,
        originalName: "too-large.txt",
        contentType: "text/plain",
        sizeBytes: 5,
      },
      ctx("staff", "admin")
    );
    if (oversized.isErr()) throw oversized.error;
    await fetch(oversized.value.url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "123456789",
    });
    const tooLarge = await support.sendMessage(
      {
        id: created.value.id,
        clientId: "too-large",
        body: "Declared smaller",
        attachmentIds: [oversized.value.fileId],
      },
      ctx("staff", "admin")
    );
    expect(tooLarge.isErr()).toBe(true);
    const download = await support.downloadAttachment(
      { id: created.value.id, fileId: upload.value.fileId },
      ctx("user")
    );
    if (download.isErr()) throw download.error;
    expect(await fetch(download.value.url).then((response) => response.text())).toBe("Hello");
    const denied = await support.downloadAttachment(
      { id: created.value.id, fileId: upload.value.fileId },
      ctx("other")
    );
    expect(denied.isErr() && denied.error.code).toBe("FORBIDDEN");
    const before = await support.sync({ id: created.value.id }, ctx("user"));
    if (before.isErr()) throw before.error;
    const redacted = await support.redactMessage(
      { id: created.value.id, messageId: message.value.id, reason: "Contains personal details" },
      ctx("staff", "admin")
    );
    if (redacted.isErr()) throw redacted.error;
    expect((await fetch(download.value.url)).status).toBe(404);
    const leftover = await store.getS3Object(interruptedKey, "local");
    expect(leftover.isErr()).toBe(true);

    const tail = await support.sync(
      { id: created.value.id, cursor: before.value.cursor },
      ctx("user")
    );
    if (tail.isErr()) throw tail.error;
    expect(tail.value.messages[0].body).toBe("");
    expect(tail.value.messages[0].redactedAt).not.toBeNull();

    const settings = await support.saveSettings(
      {
        expectedVersion: 0,
        nativeLocales: ["en", "pl", "de"],
        fallbackLocale: "en",
        translation: {
          enabled: true,
          budget: {
            monthlyCalls: 2,
            dailyUserCalls: 2,
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
    const language = await support.setLanguage({ id: created.value.id, locale: "pl" }, ctx("user"));
    if (language.isErr()) throw language.error;
    const heldUpload = await support.initiateAttachment(
      { id: created.value.id, originalName: "held.txt", contentType: "text/plain", sizeBytes: 5 },
      ctx("staff", "admin")
    );
    if (heldUpload.isErr()) throw heldUpload.error;
    expect(
      (
        await fetch(heldUpload.value.url, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: "Hello",
        })
      ).status
    ).toBe(200);
    const heldReply = await support.sendMessage(
      {
        id: created.value.id,
        clientId: "held-file",
        body: "See attached",
        attachmentIds: [heldUpload.value.fileId],
      },
      ctx("staff", "admin")
    );
    if (heldReply.isErr()) throw heldReply.error;
    const attachment = { id: created.value.id, fileId: heldUpload.value.fileId };
    expect((await support.downloadAttachment(attachment, ctx("user"))).isErr()).toBe(true);
    const translating = support.processWork();
    await translationStarted;
    const changed = await support.setLanguage({ id: created.value.id, locale: "de" }, ctx("user"));
    if (changed.isErr()) throw changed.error;
    releaseTranslation();
    const stale = await translating;
    if (stale.isErr()) throw stale.error;
    expect((await support.downloadAttachment(attachment, ctx("user"))).isErr()).toBe(true);
    const completed = await support.processWork();
    if (completed.isErr()) throw completed.error;
    const delivered = await support.getCase({ id: created.value.id }, ctx("user"));
    if (delivered.isErr()) throw delivered.error;
    expect(delivered.value.messages.at(-1)?.publishedBody).toBe("de: See attached");
    const shared = await support.downloadAttachment(attachment, ctx("user"));
    if (shared.isErr()) throw shared.error;
    expect(await fetch(shared.value.url).then((response) => response.text())).toBe("Hello");
  } finally {
    releaseTranslation();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
