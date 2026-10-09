import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { err, ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { MembershipLookup, OrganizationActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import { ServerError } from "../../../utils/errors";
import { defaultFileGrants } from "../file.grants";
import { LocalFileObjectStore } from "../file.local-store";
import { FILE_S3_MOCK_MOUNT } from "../file.object-store";
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
        userId: data.userId ?? null,
        memberId: data.memberId ?? null,
        organizationId: data.organizationId ?? null,
        bucket: data.bucket ?? "app-bucket",
        key: data.key ?? `key-${uuidv4()}`,
        originalName: data.originalName ?? "file.bin",
        originalExtension: data.originalExtension ?? null,
        contentType: data.contentType ?? "image/png",
        sizeBytes: data.sizeBytes ?? null,
        etag: data.etag ?? null,
        checksumSha256: data.checksumSha256 ?? null,
        metadata: data.metadata ?? null,
        status: data.status ?? "UPLOADED",
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
      return ok(
        [...rows.values()].find((item) => item.bucket === bucket && item.key === key && !item.deletedAt)
      );
    },
  } as FileRepository;
}

function membershipsFor(orgId: string, memberId: string): MembershipLookup {
  return {
    findMemberByUserAndOrganization: async ({ userId, organizationId }) => {
      if (organizationId !== orgId) {
        return err(
          new ServerError({
            code: "NOT_FOUND",
            layer: "repository",
            layerName: "MembershipFixture",
            message: "Member not found",
          })
        );
      }
      return ok({ id: memberId, userId, role: "member" });
    },
  };
}

describe("FileService.getDownloadUrl", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup() {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-dl-"));
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
    return { files, service };
  }

  it("returns a short-lived URL after Grant read", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      bucket: "app-bucket",
      key: "folder/a.png",
    });
    if (created.isErr()) return;

    const result = await service.getDownloadUrl(
      { fileId: created.value.id },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.url).toBe(
      `http://localhost:3000${FILE_S3_MOCK_MOUNT}/app-bucket/folder/a.png`
    );
    expect(result.value.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("accepts a bucket and key locator", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      bucket: "app-bucket",
      key: "b.png",
    });
    if (created.isErr()) return;

    const result = await service.getDownloadUrl(
      { bucket: "app-bucket", key: "b.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.url).toContain("b.png");
  });

  it("denies another member with read: own", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (created.isErr()) return;

    const result = await service.getDownloadUrl(
      { fileId: created.value.id },
      {
        actor: organizationActor({ userId: "user-2", memberId: "member-2" }),
        user: { id: "user-2" },
      }
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("builds OrganizationActor from the File organization, not a session org", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-file-org",
      organizationId: "org-file",
      bucket: "app-bucket",
      key: "from-file.png",
    });
    if (created.isErr()) return;

    const result = await service.downloadById(created.value.id, {
      userId: "user-1",
      userRole: "user",
      memberships: membershipsFor("org-file", "member-file-org"),
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.url).toContain("from-file.png");
  });
});
