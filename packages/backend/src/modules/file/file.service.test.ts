import { ok } from "neverthrow";
import type { OrganizationActor } from "../base/base.actor";
import { defaultFileGrants } from "./file.grants";
import type { FileRepository, FileS3Repository } from "./file.repository";
import { FileService } from "./file.service";

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

describe("FileService.recordLocalUpload", () => {
  it("stamps memberId on org-scoped inventory rows", async () => {
    const create = jest.fn().mockResolvedValue(
      ok({
        id: "file-1",
        memberId: "member-1",
        organizationId: "org-1",
        userId: "user-1",
        originalName: "hello.png",
        status: "UPLOADED",
      })
    );
    const service = new FileService(
      {
        file: { create } as unknown as FileRepository,
        fileS3: {} as FileS3Repository,
      },
      {},
      defaultFileGrants
    );

    const result = await service.recordLocalUpload(organizationActor(), {
      originalName: "hello.png",
      contentType: "image/png",
      sizeBytes: 12,
      filename: "abc.png",
    });

    expect(result.isOk()).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "member-1",
        organizationId: "org-1",
        userId: "user-1",
        status: "UPLOADED",
        bucket: "local",
        originalName: "hello.png",
        contentType: "image/png",
        sizeBytes: 12,
        key: "abc.png",
      })
    );
  });
});
