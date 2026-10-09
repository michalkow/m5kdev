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
        key: data.key ?? "stable-key.png",
        originalName: data.originalName ?? "old.png",
        originalExtension: data.originalExtension ?? "png",
        contentType: data.contentType ?? "image/png",
        sizeBytes: data.sizeBytes ?? 12,
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
        [...rows.values()].find(
          (item) => item.bucket === bucket && item.key === key && !item.deletedAt
        )
      );
    },
    async updateOriginalNameAndMetadata(
      id: string,
      data: {
        originalName?: string;
        originalExtension?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    ): ServerResultAsync<FileRow> {
      const row = rows.get(id);
      if (!row) return ok(row as never);
      const next = {
        ...row,
        originalName: data.originalName ?? row.originalName,
        originalExtension:
          data.originalExtension === undefined ? row.originalExtension : data.originalExtension,
        metadata: data.metadata === undefined ? row.metadata : data.metadata,
        updatedAt: new Date(),
      };
      rows.set(id, next);
      return ok(next);
    },
  } as FileRepository;
}

describe("FileService.update", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup() {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-update-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const files = memoryFileRepository();
    const service = new FileService({ file: files, fileS3: store }, {}, defaultFileGrants, {
      buckets: ["app-bucket"],
    });
    return { files, service };
  }

  it("updates originalName and metadata without changing key or bytes", async () => {
    const { files, service } = await setup();
    const created = await files.create({ key: "stable-key.png", sizeBytes: 12 });
    if (created.isErr()) return;

    const updated = await service.update(
      { fileId: created.value.id, originalName: "renamed.png", metadata: { alt: "shot" } },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(updated.isOk()).toBe(true);
    if (updated.isErr()) return;
    expect(updated.value.originalName).toBe("renamed.png");
    expect(updated.value.metadata).toEqual({ alt: "shot" });
    expect(updated.value.key).toBe("stable-key.png");
    expect(updated.value.sizeBytes).toBe(12);
    expect(updated.value.contentType).toBe("image/png");
    expect(updated.value.bucket).toBe("app-bucket");
  });

  it("does not update a PENDING File", async () => {
    const { files, service } = await setup();
    const created = await files.create({ status: "PENDING" });
    if (created.isErr()) return;

    const updated = await service.update(
      { fileId: created.value.id, originalName: "nope.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(updated.isErr()).toBe(true);
    if (updated.isOk()) return;
    expect(updated.error.code).toBe("NOT_FOUND");
  });

  it("denies another member with write: own", async () => {
    const { files, service } = await setup();
    const created = await files.create({});
    if (created.isErr()) return;

    const updated = await service.update(
      { fileId: created.value.id, originalName: "stolen.png" },
      {
        actor: organizationActor({ userId: "user-2", memberId: "member-2" }),
        user: { id: "user-2" },
      }
    );
    expect(updated.isErr()).toBe(true);
    if (updated.isOk()) return;
    expect(updated.error.code).toBe("FORBIDDEN");
  });

  it("updates originalName by bucket and key", async () => {
    const { files, service } = await setup();
    const created = await files.create({ key: "by-locator.png", sizeBytes: 12 });
    if (created.isErr()) return;

    const updated = await service.update(
      { bucket: "app-bucket", key: "by-locator.png", originalName: "located.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(updated.isOk()).toBe(true);
    if (updated.isErr()) return;
    expect(updated.value.originalName).toBe("located.png");
    expect(updated.value.key).toBe("by-locator.png");
  });
});
