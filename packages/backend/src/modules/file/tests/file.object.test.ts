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
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
        userId: data.userId ?? null,
        memberId: data.memberId ?? null,
        organizationId: data.organizationId ?? null,
        bucket: data.bucket ?? "app-bucket",
        key: data.key ?? "key",
        originalName: data.originalName ?? "file.bin",
        originalExtension: data.originalExtension ?? null,
        contentType: data.contentType ?? "application/octet-stream",
        sizeBytes: data.sizeBytes ?? null,
        etag: data.etag ?? null,
        checksumSha256: data.checksumSha256 ?? null,
        metadata: data.metadata ?? null,
        status: data.status ?? "PENDING",
        uploadedAt: data.uploadedAt ?? null,
      } satisfies FileRow;
      rows.set(row.id, row);
      return ok(row);
    },
    async findActiveById(id: string): ServerResultAsync<FileRow | undefined> {
      const row = rows.get(id);
      if (!row || row.deletedAt) return ok(undefined);
      return ok(row);
    },
    async findActiveByBucketAndKey(
      bucket: string,
      key: string
    ): ServerResultAsync<FileRow | undefined> {
      const row = [...rows.values()].find(
        (item) => item.bucket === bucket && item.key === key && !item.deletedAt
      );
      return ok(row);
    },
  } as FileRepository & { row(id: string): FileRow | undefined };
}

describe("FileService.putObject and getObject", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup() {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-object-"));
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
      { buckets: ["app-bucket"] }
    );
    return { store, files, service };
  }

  it("writes bytes and inserts an UPLOADED File without Grants", async () => {
    const { files, service } = await setup();
    const result = await service.putObject({
      body: Buffer.from("hello"),
      contentType: "image/png",
      originalName: "shot.png",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.status).toBe("UPLOADED");
    expect(files.row(result.value.id)?.status).toBe("UPLOADED");

    const got = await service.getObject({ fileId: result.value.id });
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.body.toString("utf8")).toBe("hello");
    expect(got.value.contentType).toBe("image/png");
  });

  it("rejects putObject without ownership stamps", async () => {
    const { service } = await setup();
    const result = await service.putObject({
      body: Buffer.from("hello"),
      contentType: "image/png",
      originalName: "shot.png",
    });
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("BAD_REQUEST");
  });

  it("does not return bytes for a PENDING File", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "PENDING",
      bucket: "app-bucket",
      key: "pending-key",
      originalName: "pending.png",
      contentType: "image/png",
      userId: "user-1",
    });
    if (created.isErr()) return;

    const got = await service.getObject({ fileId: created.value.id });
    expect(got.isErr()).toBe(true);
    if (got.isOk()) return;
    expect(got.error.code).toBe("NOT_FOUND");
  });

  it("loads an UPLOADED File by bucket and key", async () => {
    const { service } = await setup();
    const put = await service.putObject({
      body: Buffer.from("by-key"),
      contentType: "image/jpeg",
      originalName: "cam.jpg",
      userId: "user-1",
    });
    if (put.isErr()) return;

    const got = await service.getObject({ bucket: put.value.bucket, key: put.value.key });
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.body.toString("utf8")).toBe("by-key");
    expect(got.value.fileId).toBe(put.value.id);
  });
});
