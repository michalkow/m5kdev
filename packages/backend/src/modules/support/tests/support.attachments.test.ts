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
  const support = new SupportService(
    { support: new SupportRepository({ orm, schema }) },
    { file },
    undefined,
    { maxFileBytes: 8 }
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
    const tail = await support.sync(
      { id: created.value.id, cursor: before.value.cursor },
      ctx("user")
    );
    if (tail.isErr()) throw tail.error;
    expect(tail.value.messages[0].body).toBe("");
    expect(tail.value.messages[0].redactedAt).not.toBeNull();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
