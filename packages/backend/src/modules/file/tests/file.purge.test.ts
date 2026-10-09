import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { ServerResultAsync } from "../../base/base.dto";
import { defaultFileGrants } from "../file.grants";
import { LocalFileObjectStore } from "../file.local-store";
import type { FileRepository, FileRow } from "../file.repository";
import { FileService } from "../file.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function memoryFileRepository(): FileRepository & {
  row(id: string): FileRow | undefined;
} {
  const rows = new Map<string, FileRow>();
  return {
    row(id: string): FileRow | undefined {
      return rows.get(id);
    },
    async create(data: Partial<FileRow>): ServerResultAsync<FileRow> {
      const row = {
        id: data.id ?? uuidv4(),
        createdAt: data.createdAt ?? new Date(),
        updatedAt: data.updatedAt ?? null,
        deletedAt: data.deletedAt ?? null,
        userId: data.userId ?? "user-1",
        memberId: data.memberId ?? "member-1",
        organizationId: data.organizationId ?? "org-1",
        bucket: data.bucket ?? "app-bucket",
        key: data.key ?? `key-${uuidv4()}`,
        originalName: data.originalName ?? "shot.png",
        originalExtension: data.originalExtension ?? "png",
        contentType: data.contentType ?? "image/png",
        sizeBytes: data.sizeBytes ?? 4,
        etag: data.etag ?? null,
        checksumSha256: data.checksumSha256 ?? null,
        metadata: data.metadata ?? null,
        status: data.status ?? "PENDING",
        uploadedAt: data.uploadedAt ?? null,
      } satisfies FileRow;
      rows.set(row.id, row);
      return ok(row);
    },
    async listPendingCreatedBefore(before: Date): ServerResultAsync<FileRow[]> {
      return ok(
        [...rows.values()].filter(
          (row) => row.status === "PENDING" && !row.deletedAt && row.createdAt < before
        )
      );
    },
    async listDeletedBefore(before: Date): ServerResultAsync<FileRow[]> {
      return ok(
        [...rows.values()].filter(
          (row) =>
            row.status === "DELETED" && row.deletedAt !== null && row.deletedAt < before
        )
      );
    },
    async markFailedById(id: string): ServerResultAsync<FileRow> {
      const row = rows.get(id);
      if (!row) {
        return ok(row as never);
      }
      const next = { ...row, status: "FAILED" as const, updatedAt: new Date() };
      rows.set(id, next);
      return ok(next);
    },
  } as FileRepository & { row(id: string): FileRow | undefined };
}

describe("FileService.purgeExpired", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup(deleteAfterDays = 30) {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-purge-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const files = memoryFileRepository();
    const service = new FileService(
      { file: files, fileS3: store },
      {},
      defaultFileGrants,
      { buckets: ["app-bucket"], deleteAfterDays, purgeObjectOnDelete: false }
    );
    return { files, store, service };
  }

  it("marks PENDING older than one day FAILED and deletes the S3 object", async () => {
    const { files, store, service } = await setup();
    const created = await files.create({
      status: "PENDING",
      createdAt: new Date(Date.now() - 2 * DAY_MS),
      key: "stale-pending.png",
      bucket: "app-bucket",
    });
    if (created.isErr()) return;
    await store.putS3Object(created.value.key, Buffer.from("old"), "image/png", created.value.bucket);

    const purged = await service.purgeExpired();
    expect(purged.isOk()).toBe(true);
    expect(files.row(created.value.id)?.status).toBe("FAILED");

    const head = await store.headS3Object(created.value.key, created.value.bucket);
    expect(head.isOk() && head.value).toBe(false);
  });

  it("leaves recent PENDING Files and their objects", async () => {
    const { files, store, service } = await setup();
    const created = await files.create({
      status: "PENDING",
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      key: "fresh-pending.png",
      bucket: "app-bucket",
    });
    if (created.isErr()) return;
    await store.putS3Object(created.value.key, Buffer.from("new"), "image/png", created.value.bucket);

    await service.purgeExpired();
    expect(files.row(created.value.id)?.status).toBe("PENDING");
    const head = await store.headS3Object(created.value.key, created.value.bucket);
    expect(head.isOk() && head.value).toBe(true);
  });

  it("deletes S3 for DELETED Files older than deleteAfterDays", async () => {
    const { files, store, service } = await setup(30);
    const created = await files.create({
      status: "DELETED",
      deletedAt: new Date(Date.now() - 31 * DAY_MS),
      createdAt: new Date(Date.now() - 40 * DAY_MS),
      key: "old-deleted.png",
      bucket: "app-bucket",
    });
    if (created.isErr()) return;
    await store.putS3Object(created.value.key, Buffer.from("gone"), "image/png", created.value.bucket);

    await service.purgeExpired();
    const head = await store.headS3Object(created.value.key, created.value.bucket);
    expect(head.isOk() && head.value).toBe(false);
  });

  it("keeps S3 for DELETED Files still inside deleteAfterDays", async () => {
    const { files, store, service } = await setup(30);
    const created = await files.create({
      status: "DELETED",
      deletedAt: new Date(Date.now() - 2 * DAY_MS),
      createdAt: new Date(Date.now() - 3 * DAY_MS),
      key: "recent-deleted.png",
      bucket: "app-bucket",
    });
    if (created.isErr()) return;
    await store.putS3Object(created.value.key, Buffer.from("keep"), "image/png", created.value.bucket);

    await service.purgeExpired();
    const head = await store.headS3Object(created.value.key, created.value.bucket);
    expect(head.isOk() && head.value).toBe(true);
  });
});
