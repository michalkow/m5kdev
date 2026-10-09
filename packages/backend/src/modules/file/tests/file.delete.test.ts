import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { OrganizationActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import { defaultFileGrants } from "../file.grants";
import { LocalFileObjectStore } from "../file.local-store";
import type { FileRepository, FileRow } from "../file.repository";
import { FileService } from "../file.service";

function organizationActor(overrides: Partial<OrganizationActor> = {}): OrganizationActor {
  return {
    userId: "user-1",
    userRole: "user",
    organizationId: "org-1",
    organizationRole: "member",
    memberId: "member-1",
    teamId: null,
    teamRole: null,
    ...overrides,
  };
}

function memoryFileRepository(): FileRepository {
  const rows = new Map<string, FileRow>();
  return {
    async create(data: Partial<FileRow>): ServerResultAsync<FileRow> {
      const row = {
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
        userId: data.userId ?? "user-1",
        memberId: data.memberId ?? "member-1",
        organizationId: data.organizationId ?? "org-1",
        bucket: data.bucket ?? "app-bucket",
        key: data.key ?? `key-${uuidv4()}`,
        originalName: data.originalName ?? "shot.png",
        originalExtension: data.originalExtension ?? "png",
        contentType: data.contentType ?? "image/png",
        sizeBytes: data.sizeBytes ?? 5,
        etag: data.etag ?? null,
        checksumSha256: data.checksumSha256 ?? null,
        metadata: data.metadata ?? null,
        status: data.status ?? "UPLOADED",
        uploadedAt: data.uploadedAt ?? new Date(),
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
      return ok(
        [...rows.values()].find((item) => item.bucket === bucket && item.key === key && !item.deletedAt)
      );
    },
    async softDeleteUploadById(id: string): ServerResultAsync<{ id: string }> {
      const row = rows.get(id);
      if (!row || row.deletedAt) {
        return ok({ id });
      }
      rows.set(id, {
        ...row,
        status: "DELETED",
        deletedAt: new Date(),
        updatedAt: new Date(),
      });
      return ok({ id });
    },
  } as FileRepository;
}

describe("FileService.delete", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup(purgeObjectOnDelete = true) {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-del-"));
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
      { buckets: ["app-bucket"], purgeObjectOnDelete }
    );
    return { files, store, service };
  }

  it("hides the File and deletes the S3 object when Workflow is absent", async () => {
    const { store, service } = await setup(true);
    const put = await service.putObject({
      body: Buffer.from("bye"),
      contentType: "image/png",
      originalName: "bye.png",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (put.isErr()) return;

    const deleted = await service.delete(
      { fileId: put.value.id },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(deleted.isOk()).toBe(true);

    const got = await service.get(
      { fileId: put.value.id },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(got.isErr()).toBe(true);
    if (got.isOk()) return;
    expect(got.error.code).toBe("NOT_FOUND");

    const head = await store.headS3Object(put.value.key, put.value.bucket);
    expect(head.isOk() && head.value).toBe(false);
  });

  it("keeps the S3 object when Workflow will purge later", async () => {
    const { store, service } = await setup(false);
    const put = await service.putObject({
      body: Buffer.from("keep"),
      contentType: "image/png",
      originalName: "keep.png",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (put.isErr()) return;

    await service.delete(
      { fileId: put.value.id },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    const head = await store.headS3Object(put.value.key, put.value.bucket);
    expect(head.isOk() && head.value).toBe(true);
  });

  it("denies another member with delete: own", async () => {
    const { service } = await setup();
    const put = await service.putObject({
      body: Buffer.from("own"),
      contentType: "image/png",
      originalName: "own.png",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (put.isErr()) return;

    const deleted = await service.delete(
      { fileId: put.value.id },
      {
        actor: organizationActor({ userId: "user-2", memberId: "member-2" }),
        user: { id: "user-2" },
      }
    );
    expect(deleted.isErr()).toBe(true);
    if (deleted.isOk()) return;
    expect(deleted.error.code).toBe("FORBIDDEN");
  });
});
