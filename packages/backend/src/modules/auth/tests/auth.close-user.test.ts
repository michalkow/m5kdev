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

const USER_ID = "user-1";
const MEMBER_ID = "member-1";
const ORG_ID = "org-1";
const EMAIL = "pat@example.com";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

function userCtx(overrides: { userId?: string; userRole?: string } = {}) {
  const userId = overrides.userId ?? USER_ID;
  return {
    actor: createServiceActor({
      userId,
      userRole: overrides.userRole ?? "user",
    }),
    user: { id: userId, email: EMAIL, name: "Pat", role: overrides.userRole ?? "user" },
    session: { id: "session-1", userId },
  } as never;
}

function adminCtx() {
  return {
    actor: createServiceActor({
      userId: "admin-1",
      userRole: "admin",
    }),
  } as never;
}

function liveUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: "Pat",
    email: EMAIL,
    emailVerified: true,
    image: null,
    role: "user",
    banned: false,
    closedAt: null,
    ...overrides,
  };
}

describe("AuthService.closeUser", () => {
  function createCloseAuth(fakes: {
    findById: AuthUserRepository["findById"];
    update: AuthUserRepository["update"];
    listLiveOwnedOrganizations: AuthOrganizationRepository["listLiveOwnedOrganizations"];
    listLiveNonOwnerMemberships?: AuthOrganizationRepository["listLiveNonOwnerMemberships"];
    removeOrganizationMember?: AuthOrganizationRepository["removeOrganizationMember"];
    countLiveUserAdmins?: AuthUserRepository["countLiveUserAdmins"];
    revokeUserCredentials?: AuthUserRepository["revokeUserCredentials"];
    countLiveMembers?: AuthOrganizationRepository["countLiveMembers"];
    listLiveChildOrganizations?: AuthOrganizationRepository["listLiveChildOrganizations"];
    listLiveNonOwnerMembers?: AuthOrganizationRepository["listLiveNonOwnerMembers"];
    updateOrganization?: AuthOrganizationRepository["update"];
    clearActiveOrganizationSessions?: AuthOrganizationRepository["clearActiveOrganizationSessions"];
    listPendingByOrganization?: AuthInvitationRepository["listPendingByOrganization"];
    listOwnedOrganizations?: AuthOrganizationRepository["listOwnedOrganizations"];
    purgeUser?: AuthUserRepository["purgeUser"];
    hooks?: ConstructorParameters<typeof AuthService>[5];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {
          findById: fakes.findById,
          update: fakes.update,
          countLiveUserAdmins: fakes.countLiveUserAdmins ?? jest.fn().mockResolvedValue(ok(2)),
          revokeUserCredentials:
            fakes.revokeUserCredentials ?? jest.fn().mockResolvedValue(ok(undefined)),
          purgeUser: fakes.purgeUser ?? jest.fn().mockResolvedValue(ok({ id: USER_ID })),
        } as unknown as AuthUserRepository,
        invitation: {
          listPendingByOrganization:
            fakes.listPendingByOrganization ?? jest.fn().mockResolvedValue(ok([])),
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listLiveOwnedOrganizations: fakes.listLiveOwnedOrganizations,
          listLiveNonOwnerMemberships:
            fakes.listLiveNonOwnerMemberships ?? jest.fn().mockResolvedValue(ok([])),
          removeOrganizationMember:
            fakes.removeOrganizationMember ?? jest.fn().mockResolvedValue(ok({ id: MEMBER_ID })),
          countLiveMembers: fakes.countLiveMembers ?? jest.fn().mockResolvedValue(ok(1)),
          listLiveChildOrganizations:
            fakes.listLiveChildOrganizations ?? jest.fn().mockResolvedValue(ok([])),
          listLiveNonOwnerMembers:
            fakes.listLiveNonOwnerMembers ?? jest.fn().mockResolvedValue(ok([])),
          update: fakes.updateOrganization ?? jest.fn(),
          clearActiveOrganizationSessions:
            fakes.clearActiveOrganizationSessions ?? jest.fn().mockResolvedValue(ok(undefined)),
          listOwnedOrganizations:
            fakes.listOwnedOrganizations ?? jest.fn().mockResolvedValue(ok([])),
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus(),
      undefined,
      fakes.hooks
    );
  }

  it("Closes a User who does not Own an Organization", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const findById = jest.fn().mockResolvedValue(ok(liveUser()));
    const update = jest.fn().mockResolvedValue(ok(liveUser({ closedAt })));
    const listLiveOwnedOrganizations = jest.fn().mockResolvedValue(ok([]));
    const revokeUserCredentials = jest.fn().mockResolvedValue(ok(undefined));
    const auth = createCloseAuth({
      findById,
      update,
      listLiveOwnedOrganizations,
      revokeUserCredentials,
    });

    const result = await auth.closeUser({ email: EMAIL }, userCtx());

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ id: USER_ID, closedAt });
    expect(revokeUserCredentials).toHaveBeenCalledWith(USER_ID);
  });

  it("refuses Close when the User Owns an Organization with other live Members", async () => {
    const update = jest.fn();
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser())),
      update,
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([{ id: ORG_ID, name: "Acme" }])),
      countLiveMembers: jest.fn().mockResolvedValue(ok(2)),
    });

    const result = await auth.closeUser({ email: EMAIL }, userCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Close or transfer Organizations you Own first");
    expect(update).not.toHaveBeenCalled();
  });

  it("Closes Organizations the User Owns when they are the only live Member", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const removeOrganizationMember = jest.fn().mockResolvedValue(ok({ id: MEMBER_ID }));
    const updateOrganization = jest.fn().mockResolvedValue(ok({ id: ORG_ID, closedAt }));
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser())),
      update: jest.fn().mockResolvedValue(ok(liveUser({ closedAt }))),
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([{ id: ORG_ID, name: "Acme" }])),
      countLiveMembers: jest.fn().mockResolvedValue(ok(1)),
      updateOrganization,
      removeOrganizationMember,
    });

    const result = await auth.closeUser({ email: EMAIL }, userCtx());

    expect(result.isOk()).toBe(true);
    expect(updateOrganization).toHaveBeenCalledWith({ id: ORG_ID, closedAt: expect.any(Date) });
    expect(removeOrganizationMember).not.toHaveBeenCalled();
  });

  it("does not un-Close owned Organizations when Restoring the User", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const updateOrganization = jest.fn();
    const auth = createCloseAuth({
      findById: jest
        .fn()
        .mockResolvedValueOnce(ok(liveUser()))
        .mockResolvedValueOnce(ok(liveUser({ closedAt }))),
      update: jest
        .fn()
        .mockResolvedValueOnce(ok(liveUser({ closedAt })))
        .mockResolvedValueOnce(ok(liveUser({ closedAt: null }))),
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([])),
      updateOrganization,
    });

    const closed = await auth.closeUser({ email: EMAIL }, userCtx());
    expect(closed.isOk()).toBe(true);

    const restored = await auth.restoreUser({ id: USER_ID }, adminCtx());
    expect(restored.isOk()).toBe(true);
    expect(updateOrganization).not.toHaveBeenCalled();
  });

  it("leaves non-Owner Memberships and does not revive them on Restore", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const removeOrganizationMember = jest.fn().mockResolvedValue(ok({ id: MEMBER_ID }));
    const update = jest
      .fn()
      .mockResolvedValueOnce(ok(liveUser({ closedAt })))
      .mockResolvedValueOnce(ok(liveUser({ closedAt: null })));
    const auth = createCloseAuth({
      findById: jest
        .fn()
        .mockResolvedValueOnce(ok(liveUser()))
        .mockResolvedValueOnce(ok(liveUser({ closedAt }))),
      update,
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([])),
      listLiveNonOwnerMemberships: jest.fn().mockResolvedValue(
        ok([
          {
            id: MEMBER_ID,
            organizationId: ORG_ID,
            userId: USER_ID,
            role: "member",
          },
        ])
      ),
      removeOrganizationMember,
    });

    const closed = await auth.closeUser({ email: EMAIL }, userCtx());
    expect(closed.isOk()).toBe(true);
    expect(removeOrganizationMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });

    const restored = await auth.restoreUser({ id: USER_ID }, adminCtx());
    expect(restored.isOk()).toBe(true);
    if (restored.isErr()) return;
    expect(restored.value).toEqual({ id: USER_ID, closedAt: null });
    expect(removeOrganizationMember).toHaveBeenCalledTimes(1);
  });

  it("refuses Close of the last User-role admin", async () => {
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser({ role: "admin" }))),
      update: jest.fn(),
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([])),
      countLiveUserAdmins: jest.fn().mockResolvedValue(ok(1)),
    });

    const result = await auth.closeUser({ email: EMAIL }, userCtx({ userRole: "admin" }));

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Cannot Close the last User-role admin");
  });

  it("refuses Close when the typed email does not match", async () => {
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser())),
      update: jest.fn(),
      listLiveOwnedOrganizations: jest.fn(),
    });

    const result = await auth.closeUser({ email: "other@example.com" }, userCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Type your email to confirm");
  });

  it("lets an AdminActor Close another User", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser())),
      update: jest.fn().mockResolvedValue(ok(liveUser({ closedAt }))),
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([])),
    });

    const result = await auth.adminCloseUser({ id: USER_ID }, adminCtx());

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ id: USER_ID, closedAt });
  });

  it("Restores a User whose Closed grace has elapsed but who is not yet Purged", async () => {
    const closedAt = new Date("2026-09-01T12:00:00.000Z");
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser({ closedAt }))),
      update: jest.fn().mockResolvedValue(ok(liveUser({ closedAt: null }))),
      listLiveOwnedOrganizations: jest.fn(),
    });

    const restored = await auth.restoreUser({ id: USER_ID }, adminCtx());

    expect(restored.isOk()).toBe(true);
    if (restored.isErr()) return;
    expect(restored.value).toEqual({ id: USER_ID, closedAt: null });
  });

  it("refuses Purge User while they still Own an Organization", async () => {
    const purgeUser = jest.fn();
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser({ closedAt: new Date() }))),
      update: jest.fn(),
      listLiveOwnedOrganizations: jest.fn(),
      listOwnedOrganizations: jest.fn().mockResolvedValue(ok([{ id: ORG_ID, name: "Acme" }])),
      purgeUser,
    });

    const result = await auth.purgeUser({ id: USER_ID }, adminCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Cannot Purge a User who still Owns an Organization");
    expect(purgeUser).not.toHaveBeenCalled();
  });

  it("Purges a User and runs afterPurgeUser", async () => {
    const afterPurgeUser = jest.fn().mockResolvedValue(undefined);
    const purgeUser = jest.fn().mockResolvedValue(ok({ id: USER_ID }));
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser({ closedAt: new Date() }))),
      update: jest.fn(),
      listLiveOwnedOrganizations: jest.fn(),
      listOwnedOrganizations: jest.fn().mockResolvedValue(ok([])),
      purgeUser,
      hooks: { afterPurgeUser },
    });

    const result = await auth.purgeUser({ id: USER_ID }, adminCtx());

    expect(result.isOk()).toBe(true);
    expect(afterPurgeUser).toHaveBeenCalled();
    expect(purgeUser).toHaveBeenCalledWith(USER_ID);
  });
});
