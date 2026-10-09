import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ok } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import type { OrganizationActor, UserActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import { flattenNestedGrants } from "../../base/base.grants";
import { defaultFileGrants } from "../file.grants";
import { LocalFileObjectStore } from "../file.local-store";
import type { FileRepository, FileRow } from "../file.repository";
import { FileService, type FileServiceConfig } from "../file.service";

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

function ownerActor(): OrganizationActor {
  return organizationActor({ organizationRole: "owner", memberId: "member-owner" });
}

function userActor(overrides: Partial<UserActor> = {}): UserActor {
  return {
    userId: "user-1",
    userRole: "user",
    organizationId: null,
    organizationRole: null,
    memberId: null,
    teamId: null,
    teamRole: null,
    ...overrides,
  };
}

const memberOrgReadGrants = flattenNestedGrants({
  file: {
    user: {
      user: { read: "own", write: "own", delete: "own" },
      admin: { read: "all", write: "all", delete: "all" },
    },
    organization: {
      owner: { read: "org", write: "org", delete: "org" },
      admin: { read: "org", write: "org", delete: "org" },
      member: { read: "org", write: "own", delete: "own" },
    },
  },
});

function memoryFileRepository(): FileRepository & { row(id: string): FileRow | undefined } {
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
        key: data.key ?? `key-${uuidv4()}`,
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
      return ok(
        [...rows.values()].find(
          (item) => item.bucket === bucket && item.key === key && !item.deletedAt
        )
      );
    },
    async queryList(query?: {
      filters?: readonly { columnId: string; method: string; value?: unknown }[];
    }) {
      let listed = [...rows.values()].filter((row) => !row.deletedAt);
      for (const filter of query?.filters ?? []) {
        if (filter.method === "equals") {
          listed = listed.filter(
            (row) => (row as unknown as Record<string, unknown>)[filter.columnId] === filter.value
          );
        }
        if (filter.method === "is_null") {
          listed = listed.filter(
            (row) => (row as unknown as Record<string, unknown>)[filter.columnId] == null
          );
        }
      }
      return ok({ rows: listed, total: listed.length });
    },
  } as FileRepository & { row(id: string): FileRow | undefined };
}

describe("FileService.list and get", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup(
    grants = defaultFileGrants,
    config: FileServiceConfig = { buckets: ["app-bucket"] }
  ) {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-get-"));
    const store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
    const files = memoryFileRepository();
    const service = new FileService({ file: files, fileS3: store }, {}, grants, config);
    return { files, service };
  }

  it("lists only UPLOADED Files the member may read", async () => {
    const { files, service } = await setup();
    await files.create({
      status: "PENDING",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      originalName: "pending.png",
    });
    const uploaded = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      originalName: "done.png",
    });
    if (uploaded.isErr()) return;

    const listed = await service.list({}, { actor: organizationActor(), user: { id: "user-1" } });
    expect(listed.isOk()).toBe(true);
    if (listed.isErr()) return;
    expect(listed.value.rows.map((row) => row.originalName)).toEqual(["done.png"]);
  });

  it("lets an owner list another member's org File", async () => {
    const { files, service } = await setup();
    await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      originalName: "member.png",
    });

    const listed = await service.list({}, { actor: ownerActor(), user: { id: "owner" } });
    expect(listed.isOk()).toBe(true);
    if (listed.isErr()) return;
    expect(listed.value.rows).toHaveLength(1);
  });

  it("gets an UPLOADED File by id without a download URL", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      originalName: "shot.png",
      bucket: "app-bucket",
      key: "org/org-1/user/user-1/shot.png",
    });
    if (created.isErr()) return;

    const got = await service.get(
      { fileId: created.value.id },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.originalName).toBe("shot.png");
    expect(got.value).not.toHaveProperty("url");
  });

  it("gets an UPLOADED File by bucket and key", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      bucket: "app-bucket",
      key: "abc.png",
    });
    if (created.isErr()) return;

    const got = await service.get(
      { bucket: "app-bucket", key: "abc.png" },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.id).toBe(created.value.id);
  });

  it("does not get PENDING Files", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "PENDING",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (created.isErr()) return;

    const got = await service.get(
      { fileId: created.value.id },
      { actor: organizationActor(), user: { id: "user-1" } }
    );
    expect(got.isErr()).toBe(true);
    if (got.isOk()) return;
    expect(got.error.code).toBe("NOT_FOUND");
  });

  it("denies a UserActor getting an org File", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (created.isErr()) return;

    const got = await service.get(
      { fileId: created.value.id },
      { actor: userActor(), user: { id: "user-1" } }
    );
    expect(got.isErr()).toBe(true);
    if (got.isOk()) return;
    expect(got.error.code).toBe("FORBIDDEN");
  });

  it("lets a User-role admin get an org File", async () => {
    const { files, service } = await setup();
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (created.isErr()) return;

    const got = await service.get(
      { fileId: created.value.id },
      { actor: userActor({ userRole: "admin" }), user: { id: "user-1" } }
    );
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.id).toBe(created.value.id);
  });

  it("lets a member with read: org get another member's File", async () => {
    const { files, service } = await setup(memberOrgReadGrants);
    const created = await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
    });
    if (created.isErr()) return;

    const got = await service.get(
      { fileId: created.value.id },
      {
        actor: organizationActor({ userId: "user-2", memberId: "member-2" }),
        user: { id: "user-2" },
      }
    );
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.id).toBe(created.value.id);
  });

  it("lets a member with read: org list another member's File", async () => {
    const { files, service } = await setup(memberOrgReadGrants);
    await files.create({
      status: "UPLOADED",
      userId: "user-1",
      memberId: "member-1",
      organizationId: "org-1",
      originalName: "theirs.png",
    });

    const listed = await service.list(
      {},
      {
        actor: organizationActor({ userId: "user-2", memberId: "member-2" }),
        user: { id: "user-2" },
      }
    );
    expect(listed.isOk()).toBe(true);
    if (listed.isErr()) return;
    expect(listed.value.rows.map((row) => row.originalName)).toEqual(["theirs.png"]);
  });
});
