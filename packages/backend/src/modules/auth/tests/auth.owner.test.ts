import { ok } from "neverthrow";
import { createServiceActor } from "../../../base/base.actor";
import type { ServerEventBus } from "../../../base/server-event";
import type { EmailService } from "../../email/email.service";
import { defaultAuthGrants } from "../auth.grants";
import type {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "../auth.repository";
import { AuthService } from "../auth.service";

const ORG_ID = "org-1";
const OWNER_MEMBER_ID = "member-owner";
const TARGET_MEMBER_ID = "member-admin";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

function adminCtx() {
  return {
    actor: createServiceActor({
      userId: "admin-1",
      userRole: "admin",
    }),
  } as never;
}

function liveOwner(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNER_MEMBER_ID,
    organizationId: ORG_ID,
    userId: "user-owner",
    role: "owner",
    email: "owner@example.com",
    name: "Owner",
    ...overrides,
  };
}

function activeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_MEMBER_ID,
    organizationId: ORG_ID,
    userId: "user-admin",
    role: "admin",
    email: "admin@example.com",
    name: "Admin",
    ...overrides,
  };
}

describe("AuthService.transferOrganizationOwner", () => {
  function createTransferAuth(fakes: {
    listLiveOwners: AuthOrganizationRepository["listLiveOwners"];
    findLiveOrganizationMember: AuthOrganizationRepository["findLiveOrganizationMember"];
    transferOrganizationOwner: AuthOrganizationRepository["transferOrganizationOwner"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listLiveOwners: fakes.listLiveOwners,
          findLiveOrganizationMember: fakes.findLiveOrganizationMember,
          transferOrganizationOwner: fakes.transferOrganizationOwner,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("promotes an active Member and demotes the previous Owner to admin", async () => {
    const listLiveOwners = jest.fn().mockResolvedValue(ok([liveOwner()]));
    const findLiveOrganizationMember = jest.fn().mockResolvedValue(ok(activeMember()));
    const transferOrganizationOwner = jest.fn().mockResolvedValue(
      ok({
        previousOwner: liveOwner({ role: "admin" }),
        owner: activeMember({ role: "owner" }),
      })
    );
    const auth = createTransferAuth({
      listLiveOwners,
      findLiveOrganizationMember,
      transferOrganizationOwner,
    });

    const result = await auth.transferOrganizationOwner(
      { organizationId: ORG_ID, memberId: TARGET_MEMBER_ID },
      adminCtx()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.previousOwner).toEqual({ id: OWNER_MEMBER_ID, role: "admin" });
      expect(result.value.owner).toEqual({ id: TARGET_MEMBER_ID, role: "owner" });
    }
    expect(transferOrganizationOwner).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      previousOwnerMemberId: OWNER_MEMBER_ID,
      previousOwnerUserId: "user-owner",
      nextOwnerMemberId: TARGET_MEMBER_ID,
      nextOwnerUserId: "user-admin",
    });
  });

  it("refuses transfer when there is no live Owner", async () => {
    const transferOrganizationOwner = jest.fn();
    const auth = createTransferAuth({
      listLiveOwners: jest.fn().mockResolvedValue(ok([])),
      findLiveOrganizationMember: jest.fn().mockResolvedValue(ok(activeMember())),
      transferOrganizationOwner,
    });

    const result = await auth.transferOrganizationOwner(
      { organizationId: ORG_ID, memberId: TARGET_MEMBER_ID },
      adminCtx()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(transferOrganizationOwner).not.toHaveBeenCalled();
  });

  it("refuses transfer when there is not exactly one live Owner", async () => {
    const transferOrganizationOwner = jest.fn();
    const auth = createTransferAuth({
      listLiveOwners: jest.fn().mockResolvedValue(ok([liveOwner(), liveOwner({ id: "member-2" })])),
      findLiveOrganizationMember: jest.fn().mockResolvedValue(ok(activeMember())),
      transferOrganizationOwner,
    });

    const result = await auth.transferOrganizationOwner(
      { organizationId: ORG_ID, memberId: TARGET_MEMBER_ID },
      adminCtx()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(transferOrganizationOwner).not.toHaveBeenCalled();
  });

  it("refuses transfer to an invited Membership", async () => {
    const transferOrganizationOwner = jest.fn();
    const auth = createTransferAuth({
      listLiveOwners: jest.fn().mockResolvedValue(ok([liveOwner()])),
      findLiveOrganizationMember: jest
        .fn()
        .mockResolvedValue(ok(activeMember({ userId: null, role: "member" }))),
      transferOrganizationOwner,
    });

    const result = await auth.transferOrganizationOwner(
      { organizationId: ORG_ID, memberId: TARGET_MEMBER_ID },
      adminCtx()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(transferOrganizationOwner).not.toHaveBeenCalled();
  });
});

describe("AuthService.addAdminOrganizationMember Owner repair", () => {
  function createAddAuth(fakes: {
    listLiveOwners: AuthOrganizationRepository["listLiveOwners"];
    addOrganizationMember: AuthOrganizationRepository["addOrganizationMember"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listLiveOwners: fakes.listLiveOwners,
          addOrganizationMember: fakes.addOrganizationMember,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("assigns Owner when there is no live Owner", async () => {
    const addOrganizationMember = jest
      .fn()
      .mockResolvedValue(ok(activeMember({ role: "owner", userId: "user-new" })));
    const auth = createAddAuth({
      listLiveOwners: jest.fn().mockResolvedValue(ok([])),
      addOrganizationMember,
    });

    const result = await auth.addAdminOrganizationMember(
      { organizationId: ORG_ID, userId: "user-new", role: "owner" },
      adminCtx()
    );

    expect(result.isOk()).toBe(true);
    expect(addOrganizationMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: "user-new",
      role: "owner",
    });
  });

  it("refuses Owner grant when a live Owner already exists", async () => {
    const addOrganizationMember = jest.fn();
    const auth = createAddAuth({
      listLiveOwners: jest.fn().mockResolvedValue(ok([liveOwner()])),
      addOrganizationMember,
    });

    const result = await auth.addAdminOrganizationMember(
      { organizationId: ORG_ID, userId: "user-new", role: "owner" },
      adminCtx()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(addOrganizationMember).not.toHaveBeenCalled();
  });
});

describe("AuthService.updateAdminOrganizationMemberRole Owner rules", () => {
  function createUpdateAdminAuth(fakes: {
    listLiveOwners?: AuthOrganizationRepository["listLiveOwners"];
    updateOrganizationMemberRole: AuthOrganizationRepository["updateOrganizationMemberRole"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listLiveOwners: fakes.listLiveOwners ?? jest.fn(),
          updateOrganizationMemberRole: fakes.updateOrganizationMemberRole,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("refuses granting Owner via role update", async () => {
    const updateOrganizationMemberRole = jest.fn();
    const auth = createUpdateAdminAuth({ updateOrganizationMemberRole });

    const result = await auth.updateAdminOrganizationMemberRole(
      { organizationId: ORG_ID, memberId: TARGET_MEMBER_ID, role: "owner" },
      adminCtx()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(updateOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("allows demoting an extra Owner to admin", async () => {
    const updateOrganizationMemberRole = jest
      .fn()
      .mockResolvedValue(ok(liveOwner({ role: "admin" })));
    const auth = createUpdateAdminAuth({
      listLiveOwners: jest
        .fn()
        .mockResolvedValue(ok([liveOwner(), liveOwner({ id: "member-owner-2" })])),
      updateOrganizationMemberRole,
    });

    const result = await auth.updateAdminOrganizationMemberRole(
      { organizationId: ORG_ID, memberId: OWNER_MEMBER_ID, role: "admin" },
      adminCtx()
    );

    expect(result.isOk()).toBe(true);
    expect(updateOrganizationMemberRole).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: OWNER_MEMBER_ID,
      role: "admin",
    });
  });
});
