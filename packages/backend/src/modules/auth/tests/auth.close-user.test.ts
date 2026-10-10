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
        } as unknown as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listLiveOwnedOrganizations: fakes.listLiveOwnedOrganizations,
          listLiveNonOwnerMemberships:
            fakes.listLiveNonOwnerMemberships ?? jest.fn().mockResolvedValue(ok([])),
          removeOrganizationMember:
            fakes.removeOrganizationMember ?? jest.fn().mockResolvedValue(ok({ id: MEMBER_ID })),
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
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

  it("refuses Close when the User Owns an Organization", async () => {
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveUser())),
      update: jest.fn(),
      listLiveOwnedOrganizations: jest.fn().mockResolvedValue(ok([{ id: ORG_ID, name: "Acme" }])),
    });

    const result = await auth.closeUser({ email: EMAIL }, userCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Close or transfer Organizations you Own first");
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
});
