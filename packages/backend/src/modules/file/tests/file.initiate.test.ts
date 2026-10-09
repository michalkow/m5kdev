import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { OrganizationActor, UserActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import { defaultFileGrants } from "../file.grants";
import { LocalFileObjectStore } from "../file.local-store";
import { FILE_S3_MOCK_MOUNT } from "../file.object-store";
import type { FileRepository, FileRow } from "../file.repository";
import { FileService } from "../file.service";

function organizationActor(): OrganizationActor {
  return {
    userId: "user-1",
    userRole: "user",
    organizationId: "org-1",
    organizationRole: "member",
    memberId: "member-1",
    teamId: null,
    teamRole: null,
  };
}

function userActor(): UserActor {
  return {
    userId: "user-1",
    userRole: "user",
    organizationId: null,
    organizationRole: null,
    memberId: null,
    teamId: null,
    teamRole: null,
  };
}

function memoryFileRepository(): FileRepository & {
  row(id: string): FileRow | undefined;
  all(): FileRow[];
} {
  const rows = new Map<string, FileRow>();

  const repo = {
    row(id: string): FileRow | undefined {
      return rows.get(id);
    },
    all(): FileRow[] {
      return [...rows.values()];
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
    async updateStatusById(
      id: string,
      data: { status: FileRow["status"]; etag?: string | null; uploadedAt?: Date | null }
    ): ServerResultAsync<FileRow> {
      const row = rows.get(id);
      if (!row) {
        return err({ code: "NOT_FOUND", message: "File not found" } as never);
      }
      const next = {
        ...row,
        status: data.status,
        etag: data.etag === undefined ? row.etag : data.etag,
        uploadedAt: data.uploadedAt === undefined ? row.uploadedAt : data.uploadedAt,
        updatedAt: new Date(),
      };
      rows.set(id, next);
      return ok(next);
    },
    async markFailedById(id: string): ServerResultAsync<FileRow> {
      return repo.updateStatusById(id, { status: "FAILED" });
    },
  };

  return repo as FileRepository & { row(id: string): FileRow | undefined; all(): FileRow[] };
}

describe("FileService.initiate", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("creates a PENDING org File and returns a PUT URL against the local S3 adapter", async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-initiate-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const files = memoryFileRepository();
    const service = new FileService({ file: files, fileS3: store }, {}, defaultFileGrants, {
      buckets: ["app-bucket"],
    });

    const result = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.fileId).toEqual(expect.any(String));
    expect(result.value.bucket).toBe("app-bucket");
    expect(result.value.key).toMatch(/org\/org-1\/user\/user-1\/.+\.png$/);
    expect(result.value.url).toBe(
      `http://localhost:3000${FILE_S3_MOCK_MOUNT}/app-bucket/${result.value.key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    );
    expect(files.row(result.value.fileId)?.status).toBe("PENDING");
    expect(files.row(result.value.fileId)?.memberId).toBe("member-1");
    expect(files.row(result.value.fileId)?.organizationId).toBe("org-1");
  });

  it("rejects a MIME type that is not in fileTypes", async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-initiate-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const service = new FileService(
      { file: memoryFileRepository(), fileS3: store },
      {},
      defaultFileGrants,
      { buckets: ["app-bucket"] }
    );

    const result = await service.initiate(
      { contentType: "application/pdf", originalName: "doc.pdf" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("BAD_REQUEST");
  });

  it("accepts a MIME type from FileServiceConfig.fileTypes", async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-initiate-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const service = new FileService(
      { file: memoryFileRepository(), fileS3: store },
      {},
      defaultFileGrants,
      {
        buckets: ["app-bucket"],
        fileTypes: {
          document: { mimetypes: ["application/pdf"], extensions: ["pdf"] },
        },
      }
    );

    const result = await service.initiate(
      { contentType: "application/pdf", originalName: "doc.pdf" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.fileId).toEqual(expect.any(String));
  });

  it("rejects a bucket that is not on the allowlist", async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-initiate-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const service = new FileService(
      { file: memoryFileRepository(), fileS3: store },
      {},
      defaultFileGrants,
      { buckets: ["app-bucket"] }
    );

    const result = await service.initiate(
      { contentType: "image/png", originalName: "photo.png", bucket: "other-bucket" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("BAD_REQUEST");
  });

  it("creates a personal PENDING File for a UserActor", async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-initiate-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const files = memoryFileRepository();
    const service = new FileService({ file: files, fileS3: store }, {}, defaultFileGrants, {
      buckets: ["app-bucket"],
    });

    const result = await service.initiate(
      { contentType: "image/jpeg", originalName: "me.jpg" },
      { actor: userActor(), user: { id: "user-1" } }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.key).toMatch(/^user\/user-1\/.+\.jpg$/);
    expect(result.value.key.startsWith("org/")).toBe(false);
    const row = files.row(result.value.fileId);
    expect(row?.organizationId).toBeNull();
    expect(row?.memberId).toBeNull();
    expect(row?.userId).toBe("user-1");
    expect(row?.status).toBe("PENDING");
  });

  it("leaves a FAILED row when the PUT URL cannot be minted", async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-initiate-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    store.getS3UploadUrl = async () => store.error("INTERNAL_SERVER_ERROR", "presign failed");
    const files = memoryFileRepository();
    const service = new FileService({ file: files, fileS3: store }, {}, defaultFileGrants, {
      buckets: ["app-bucket"],
    });

    const result = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(result.isErr()).toBe(true);
    expect(files.all().map((row) => row.status)).toEqual(["FAILED"]);
  });
});

describe("FileService.finalize", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup() {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-finalize-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const files = memoryFileRepository();
    const service = new FileService({ file: files, fileS3: store }, {}, defaultFileGrants, {
      buckets: ["app-bucket"],
    });
    return { store, files, service };
  }

  it("promotes PENDING to UPLOADED after the object exists", async () => {
    const { store, files, service } = await setup();
    const initiated = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(initiated.isOk()).toBe(true);
    if (initiated.isErr()) return;

    const put = await store.putS3Object(
      initiated.value.key,
      Buffer.from("png-bytes"),
      "image/png",
      initiated.value.bucket
    );
    expect(put.isOk()).toBe(true);

    const finalized = await service.finalize(
      { fileId: initiated.value.fileId },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(finalized.isOk()).toBe(true);
    expect(files.row(initiated.value.fileId)?.status).toBe("UPLOADED");
  });

  it("succeeds again when the File is already UPLOADED", async () => {
    const { store, service } = await setup();
    const initiated = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    if (initiated.isErr()) return;
    await store.putS3Object(
      initiated.value.key,
      Buffer.from("png-bytes"),
      "image/png",
      initiated.value.bucket
    );
    await service.finalize(
      { fileId: initiated.value.fileId },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    const again = await service.finalize(
      { fileId: initiated.value.fileId },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(again.isOk()).toBe(true);
  });

  it("marks FAILED when the S3 object is missing", async () => {
    const { files, service } = await setup();
    const initiated = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    if (initiated.isErr()) return;

    const finalized = await service.finalize(
      { fileId: initiated.value.fileId },
      { actor: organizationActor(), user: { id: "user-1" } }
    );

    expect(finalized.isErr()).toBe(true);
    expect(files.row(initiated.value.fileId)?.status).toBe("FAILED");
  });

  it("denies a UserActor finalizing an Organization File", async () => {
    const { store, service } = await setup();
    const initiated = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    if (initiated.isErr()) return;
    await store.putS3Object(
      initiated.value.key,
      Buffer.from("png-bytes"),
      "image/png",
      initiated.value.bucket
    );

    const finalized = await service.finalize(
      { fileId: initiated.value.fileId },
      { actor: userActor(), user: { id: "user-1" } }
    );

    expect(finalized.isErr()).toBe(true);
    if (finalized.isOk()) return;
    expect(finalized.error.code).toBe("FORBIDDEN");
  });

  it("denies another org member with write: own from finalizing", async () => {
    const { store, service } = await setup();
    const initiated = await service.initiate(
      { contentType: "image/png", originalName: "photo.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    if (initiated.isErr()) return;
    await store.putS3Object(
      initiated.value.key,
      Buffer.from("png-bytes"),
      "image/png",
      initiated.value.bucket
    );

    const otherMember: OrganizationActor = {
      userId: "user-2",
      userRole: "user",
      organizationId: "org-1",
      organizationRole: "member",
      memberId: "member-2",
      teamId: null,
      teamRole: null,
    };
    const finalized = await service.finalize(
      { fileId: initiated.value.fileId },
      { actor: otherMember, user: { id: "user-2" } }
    );

    expect(finalized.isErr()).toBe(true);
    if (finalized.isOk()) return;
    expect(finalized.error.code).toBe("FORBIDDEN");
  });
});
