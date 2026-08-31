import { err, ok } from "neverthrow";
import { createServiceActor } from "../../base/base.actor";
import type { ServerEventBus } from "../../base/server-event";
import { ServerError } from "../../utils/errors";
import type { EmailService } from "../email/email.service";
import { defaultAuthGrants } from "./auth.grants";
import type {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "./auth.repository";
import { AuthService } from "./auth.service";

const WEB_URL = "https://app.example.com";

const ORG_ID = "org-1";
const INVITATION_ID = "invite-1";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

function pendingInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    organizationId: ORG_ID,
    teamId: null,
    email: "invitee@example.com",
    role: "member",
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2099-01-08T00:00:00.000Z"),
    inviterId: "user-owner",
    memberId: "member-invited",
    ...overrides,
  };
}

function userCtx(overrides: { email?: string } = {}) {
  const email = overrides.email ?? "invitee@example.com";
  return {
    actor: createServiceActor({
      userId: "user-invitee",
      userRole: "user",
    }),
    user: { id: "user-invitee", email, name: "Ivy", image: "https://img/ivy.png" },
    session: { id: "session-1", userId: "user-invitee" },
  } as never;
}

function organizationCtx(role: string) {
  return {
    actor: createServiceActor({
      userId: "user-1",
      userRole: "user",
      organizationId: ORG_ID,
      organizationRole: role,
      memberId: "member-1",
      teamId: null,
      teamRole: null,
    }),
  } as never;
}

const MEMBER_ID = "member-invited";

describe("AuthService.updateMemberRole", () => {
  function createUpdateMemberRoleAuth(fakes: {
    updateOrganizationMemberRole: AuthOrganizationRepository["updateOrganizationMemberRole"];
    findPendingByMemberId: AuthInvitationRepository["findPendingByMemberId"];
    invitationUpdate: AuthInvitationRepository["update"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {
          findById: jest.fn(),
          update: fakes.invitationUpdate,
          findPendingByMemberId: fakes.findPendingByMemberId,
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          updateOrganizationMemberRole: fakes.updateOrganizationMemberRole,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("updates an invited Membership role and copies it onto the pending Invitation token", async () => {
    const updateOrganizationMemberRole = jest.fn().mockResolvedValue(
      ok({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: null,
        role: "admin",
      })
    );
    const invitation = pendingInvitation({ memberId: MEMBER_ID, role: "member" });
    const findPendingByMemberId = jest.fn().mockResolvedValue(ok(invitation));
    const invitationUpdate = jest.fn().mockResolvedValue(ok({ ...invitation, role: "admin" }));
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId,
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "admin" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: MEMBER_ID, role: "admin" });
    }
    expect(updateOrganizationMemberRole).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      role: "admin",
    });
    expect(invitationUpdate).toHaveBeenCalledWith({ id: INVITATION_ID, role: "admin" });
  });

  it("updates an active Membership role", async () => {
    const updateOrganizationMemberRole = jest.fn().mockResolvedValue(
      ok({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: "user-2",
        role: "admin",
      })
    );
    const findPendingByMemberId = jest.fn().mockResolvedValue(ok(null));
    const invitationUpdate = jest.fn();
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId,
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "admin" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: MEMBER_ID, role: "admin" });
    }
    expect(invitationUpdate).not.toHaveBeenCalled();
  });

  it("does not copy the role onto a non-pending Invitation", async () => {
    const updateOrganizationMemberRole = jest.fn().mockResolvedValue(
      ok({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: null,
        role: "admin",
      })
    );
    const findPendingByMemberId = jest.fn().mockResolvedValue(ok(null));
    const invitationUpdate = jest.fn();
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId,
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "admin" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    expect(invitationUpdate).not.toHaveBeenCalled();
  });

  it("refuses a left Membership", async () => {
    const updateOrganizationMemberRole = jest.fn().mockResolvedValue(
      err(
        new ServerError({
          code: "NOT_FOUND",
          layer: "repository",
          layerName: "organization",
          message: "Member not found",
        })
      )
    );
    const invitationUpdate = jest.fn();
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId: jest.fn(),
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "admin" },
      organizationCtx("owner")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(invitationUpdate).not.toHaveBeenCalled();
  });

  it("refuses assigning the Owner Role", async () => {
    const updateOrganizationMemberRole = jest.fn();
    const invitationUpdate = jest.fn();
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId: jest.fn(),
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "owner" },
      organizationCtx("owner")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(updateOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("rejects unknown organization roles", async () => {
    const updateOrganizationMemberRole = jest.fn();
    const invitationUpdate = jest.fn();
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId: jest.fn(),
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "editor" },
      organizationCtx("owner")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(updateOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("forbids organization members who cannot manage Members", async () => {
    const updateOrganizationMemberRole = jest.fn();
    const invitationUpdate = jest.fn();
    const auth = createUpdateMemberRoleAuth({
      updateOrganizationMemberRole,
      findPendingByMemberId: jest.fn(),
      invitationUpdate,
    });

    const result = await auth.updateMemberRole(
      { memberId: MEMBER_ID, role: "admin" },
      organizationCtx("member")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(updateOrganizationMemberRole).not.toHaveBeenCalled();
  });
});

describe("AuthService.inviteOrganizationMember", () => {
  function createInviteAuthService(fakes: {
    findLiveMemberByEmail: AuthOrganizationRepository["findLiveMemberByEmail"];
    createInvitedMember: AuthOrganizationRepository["createInvitedMember"];
    invitationCreate: AuthInvitationRepository["create"];
    sendOrganizationInvite: EmailService["sendOrganizationInvite"];
    findPendingLeftoverByEmail?: AuthInvitationRepository["findPendingLeftoverByEmail"];
    findPendingByMemberId?: AuthInvitationRepository["findPendingByMemberId"];
    invitationUpdate?: AuthInvitationRepository["update"];
    findLeftMemberByEmail?: AuthOrganizationRepository["findLeftMemberByEmail"];
    reviveInvitedMember?: AuthOrganizationRepository["reviveInvitedMember"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {
          findById: jest
            .fn()
            .mockResolvedValue(ok({ id: "user-1", name: "Pat", email: "pat@example.com" })),
        } as unknown as AuthUserRepository,
        invitation: {
          findById: jest.fn(),
          update: fakes.invitationUpdate ?? jest.fn().mockResolvedValue(ok(pendingInvitation())),
          create: fakes.invitationCreate,
          findPendingByMemberId:
            fakes.findPendingByMemberId ?? jest.fn().mockResolvedValue(ok(null)),
          findPendingLeftoverByEmail:
            fakes.findPendingLeftoverByEmail ?? jest.fn().mockResolvedValue(ok([])),
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          findById: jest.fn().mockResolvedValue(ok({ id: ORG_ID, name: "Acme", locale: "en" })),
          findLiveMemberByEmail: fakes.findLiveMemberByEmail,
          createInvitedMember: fakes.createInvitedMember,
          findLeftMemberByEmail:
            fakes.findLeftMemberByEmail ?? jest.fn().mockResolvedValue(ok(null)),
          reviveInvitedMember: fakes.reviveInvitedMember ?? jest.fn(),
        } as unknown as AuthOrganizationRepository,
      },
      { email: { sendOrganizationInvite: fakes.sendOrganizationInvite } as EmailService },
      defaultAuthGrants,
      createFakeBus(),
      { web: WEB_URL, api: "https://api.example.com" }
    );
  }

  it("creates a live Membership with unset userId and a pending Invitation token", async () => {
    const findLiveMemberByEmail = jest.fn().mockResolvedValue(ok(null));
    const createInvitedMember = jest.fn().mockResolvedValue(
      ok({
        id: "member-invited",
        organizationId: ORG_ID,
        userId: null,
        email: "invitee@example.com",
        name: "invitee@example.com",
        role: "member",
      })
    );
    const invitationCreate = jest.fn().mockResolvedValue(
      ok({
        id: INVITATION_ID,
        organizationId: ORG_ID,
        email: "invitee@example.com",
        role: "member",
        status: "pending",
        memberId: "member-invited",
        inviterId: "user-1",
        expiresAt: new Date("2026-09-07T00:00:00.000Z"),
      })
    );
    const sendOrganizationInvite = jest.fn().mockResolvedValue(ok(undefined));
    const auth = createInviteAuthService({
      findLiveMemberByEmail,
      createInvitedMember,
      invitationCreate,
      sendOrganizationInvite,
    });

    const result = await auth.inviteOrganizationMember(
      { email: "invitee@example.com", role: "member" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.member.id).toBe("member-invited");
      expect(result.value.member.userId).toBeNull();
      expect(result.value.invitation.id).toBe(INVITATION_ID);
      expect(result.value.invitation.memberId).toBe("member-invited");
    }
    expect(createInvitedMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "member",
    });
    expect(invitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        email: "invitee@example.com",
        role: "member",
        status: "pending",
        memberId: "member-invited",
        inviterId: "user-1",
      })
    );
    expect(sendOrganizationInvite).toHaveBeenCalledWith(
      "invitee@example.com",
      "Acme",
      "Pat",
      "member",
      `${WEB_URL}/organization/accept-invitation?id=${INVITATION_ID}`,
      { locale: "en" }
    );
  });

  it("refuses a second live Membership for the same email in the Organization", async () => {
    const findLiveMemberByEmail = jest
      .fn()
      .mockResolvedValue(
        ok({ id: "member-existing", userId: "user-2", email: "invitee@example.com" })
      );
    const createInvitedMember = jest.fn();
    const invitationCreate = jest.fn();
    const sendOrganizationInvite = jest.fn();
    const auth = createInviteAuthService({
      findLiveMemberByEmail,
      createInvitedMember,
      invitationCreate,
      sendOrganizationInvite,
    });

    const result = await auth.inviteOrganizationMember(
      { email: "invitee@example.com", role: "admin" },
      organizationCtx("owner")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("CONFLICT");
    }
    expect(createInvitedMember).not.toHaveBeenCalled();
    expect(invitationCreate).not.toHaveBeenCalled();
  });

  it("refuses inviting the Owner Role", async () => {
    const createInvitedMember = jest.fn();
    const auth = createInviteAuthService({
      findLiveMemberByEmail: jest.fn().mockResolvedValue(ok(null)),
      createInvitedMember,
      invitationCreate: jest.fn(),
      sendOrganizationInvite: jest.fn(),
    });

    const result = await auth.inviteOrganizationMember(
      { email: "invitee@example.com", role: "owner" },
      organizationCtx("owner")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(createInvitedMember).not.toHaveBeenCalled();
  });
});

describe("AuthService.listOrganizationMembers", () => {
  it("includes invited Memberships and excludes left ones", async () => {
    const listOrganizationMembers = jest.fn().mockResolvedValue(
      ok([
        {
          id: "member-active",
          organizationId: ORG_ID,
          userId: "user-2",
          email: "active@example.com",
          name: "Active",
          image: null,
          role: "member",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          deletedAt: null,
          invitationId: null,
          user: {
            id: "user-2",
            email: "active@example.com",
            name: "Active",
            role: "user",
            banned: false,
            emailVerified: true,
          },
        },
        {
          id: "member-invited",
          organizationId: ORG_ID,
          userId: null,
          email: "invitee@example.com",
          name: "invitee@example.com",
          image: null,
          role: "admin",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          deletedAt: null,
          invitationId: INVITATION_ID,
          user: null,
        },
      ])
    );
    const auth = new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {
          listExpiredPendingByOrganization: jest.fn().mockResolvedValue(ok([])),
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listOrganizationMembers,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );

    const result = await auth.listOrganizationMembers(undefined, organizationCtx("owner"));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((row) => row.id)).toEqual(["member-active", "member-invited"]);
      expect(result.value[1]?.userId).toBeNull();
    }
    expect(listOrganizationMembers).toHaveBeenCalledWith(ORG_ID);
  });
});

describe("AuthService.acceptOrganizationInvitation", () => {
  function createAcceptAuth(fakes: {
    findById: AuthInvitationRepository["findById"];
    invitationUpdate: AuthInvitationRepository["update"];
    attachUserToInvitedMember: AuthOrganizationRepository["attachUserToInvitedMember"];
    createOrganization: AuthOrganizationRepository["createOrganization"];
    activateOrganizationSession: AuthOrganizationRepository["activateOrganizationSession"];
    findOrganization: AuthOrganizationRepository["findById"];
    removeOrganizationMember?: AuthOrganizationRepository["removeOrganizationMember"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {
          findById: jest.fn().mockResolvedValue(
            ok({
              id: "user-invitee",
              email: "invitee@example.com",
              name: "Ivy",
              image: "https://img/ivy.png",
            })
          ),
        } as unknown as AuthUserRepository,
        invitation: {
          findById: fakes.findById,
          update: fakes.invitationUpdate,
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          findById: fakes.findOrganization,
          attachUserToInvitedMember: fakes.attachUserToInvitedMember,
          createOrganization: fakes.createOrganization,
          activateOrganizationSession: fakes.activateOrganizationSession,
          removeOrganizationMember:
            fakes.removeOrganizationMember ?? jest.fn().mockResolvedValue(ok({ id: MEMBER_ID })),
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("attaches the User to the existing Membership and marks the token accepted", async () => {
    const invitation = pendingInvitation();
    const findById = jest.fn().mockResolvedValue(ok(invitation));
    const invitationUpdate = jest.fn().mockResolvedValue(ok({ ...invitation, status: "accepted" }));
    const attachUserToInvitedMember = jest.fn().mockResolvedValue(
      ok({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: "user-invitee",
        role: "member",
      })
    );
    const createOrganization = jest.fn();
    const activateOrganizationSession = jest.fn().mockResolvedValue(ok(undefined));
    const findOrganization = jest.fn().mockResolvedValue(ok({ id: ORG_ID, type: "organization" }));
    const auth = createAcceptAuth({
      findById,
      invitationUpdate,
      attachUserToInvitedMember,
      createOrganization,
      activateOrganizationSession,
      findOrganization,
    });

    const result = await auth.acceptOrganizationInvitation({ id: INVITATION_ID }, userCtx());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        role: "member",
      });
    }
    expect(attachUserToInvitedMember).toHaveBeenCalledWith({
      memberId: MEMBER_ID,
      organizationId: ORG_ID,
      userId: "user-invitee",
      name: "Ivy",
      email: "invitee@example.com",
      image: "https://img/ivy.png",
    });
    expect(invitationUpdate).toHaveBeenCalledWith({ id: INVITATION_ID, status: "accepted" });
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("does not create a second Organization on the signup-with-invite path", async () => {
    const invitation = pendingInvitation();
    const createOrganization = jest.fn();
    const auth = createAcceptAuth({
      findById: jest.fn().mockResolvedValue(ok(invitation)),
      invitationUpdate: jest.fn().mockResolvedValue(ok({ ...invitation, status: "accepted" })),
      attachUserToInvitedMember: jest
        .fn()
        .mockResolvedValue(
          ok({ id: MEMBER_ID, organizationId: ORG_ID, userId: "user-invitee", role: "member" })
        ),
      createOrganization,
      activateOrganizationSession: jest.fn().mockResolvedValue(ok(undefined)),
      findOrganization: jest.fn().mockResolvedValue(ok({ id: ORG_ID, type: "organization" })),
    });

    const result = await auth.acceptOrganizationInvitation({ id: INVITATION_ID }, userCtx());

    expect(result.isOk()).toBe(true);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("rejects a token without memberId", async () => {
    const attachUserToInvitedMember = jest.fn();
    const auth = createAcceptAuth({
      findById: jest.fn().mockResolvedValue(ok(pendingInvitation({ memberId: null }))),
      invitationUpdate: jest.fn(),
      attachUserToInvitedMember,
      createOrganization: jest.fn(),
      activateOrganizationSession: jest.fn(),
      findOrganization: jest.fn(),
    });

    const result = await auth.acceptOrganizationInvitation({ id: INVITATION_ID }, userCtx());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(attachUserToInvitedMember).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const attachUserToInvitedMember = jest.fn();
    const invitationUpdate = jest
      .fn()
      .mockResolvedValue(
        ok(
          pendingInvitation({ status: "canceled", expiresAt: new Date("2020-01-01T00:00:00.000Z") })
        )
      );
    const removeOrganizationMember = jest.fn().mockResolvedValue(ok({ id: MEMBER_ID }));
    const auth = createAcceptAuth({
      findById: jest
        .fn()
        .mockResolvedValue(
          ok(pendingInvitation({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }))
        ),
      invitationUpdate,
      attachUserToInvitedMember,
      createOrganization: jest.fn(),
      activateOrganizationSession: jest.fn(),
      findOrganization: jest.fn(),
      removeOrganizationMember,
    });

    const result = await auth.acceptOrganizationInvitation({ id: INVITATION_ID }, userCtx());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(attachUserToInvitedMember).not.toHaveBeenCalled();
    expect(removeOrganizationMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
    expect(invitationUpdate).toHaveBeenCalledWith({ id: INVITATION_ID, status: "canceled" });
  });

  it("rejects an email mismatch", async () => {
    const attachUserToInvitedMember = jest.fn();
    const auth = createAcceptAuth({
      findById: jest.fn().mockResolvedValue(ok(pendingInvitation())),
      invitationUpdate: jest.fn(),
      attachUserToInvitedMember,
      createOrganization: jest.fn(),
      activateOrganizationSession: jest.fn(),
      findOrganization: jest.fn(),
    });

    const result = await auth.acceptOrganizationInvitation(
      { id: INVITATION_ID },
      userCtx({ email: "other@example.com" })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(attachUserToInvitedMember).not.toHaveBeenCalled();
  });
});

describe("AuthService.cancelOrganizationInvitation", () => {
  function createCancelAuth(fakes: {
    findById: AuthInvitationRepository["findById"];
    invitationUpdate: AuthInvitationRepository["update"];
    removeOrganizationMember: AuthOrganizationRepository["removeOrganizationMember"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {
          findById: fakes.findById,
          update: fakes.invitationUpdate,
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          removeOrganizationMember: fakes.removeOrganizationMember,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("soft-deletes the invited Membership and invalidates the token", async () => {
    const invitation = pendingInvitation();
    const findById = jest.fn().mockResolvedValue(ok(invitation));
    const invitationUpdate = jest.fn().mockResolvedValue(ok({ ...invitation, status: "canceled" }));
    const removeOrganizationMember = jest.fn().mockResolvedValue(ok({ id: MEMBER_ID }));
    const auth = createCancelAuth({ findById, invitationUpdate, removeOrganizationMember });

    const result = await auth.cancelOrganizationInvitation(
      { invitationId: INVITATION_ID },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ invitationId: INVITATION_ID, memberId: MEMBER_ID });
    }
    expect(removeOrganizationMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
    expect(invitationUpdate).toHaveBeenCalledWith({ id: INVITATION_ID, status: "canceled" });
  });

  it("forbids organization members who cannot manage Members", async () => {
    const removeOrganizationMember = jest.fn();
    const auth = createCancelAuth({
      findById: jest.fn(),
      invitationUpdate: jest.fn(),
      removeOrganizationMember,
    });

    const result = await auth.cancelOrganizationInvitation(
      { invitationId: INVITATION_ID },
      organizationCtx("member")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(removeOrganizationMember).not.toHaveBeenCalled();
  });
});

describe("AuthService.listOrganizationMembers lazy expiry", () => {
  it("applies cancel to expired pending tokens before listing", async () => {
    const expired = pendingInvitation({ expiresAt: new Date("2020-01-01T00:00:00.000Z") });
    const listExpiredPendingByOrganization = jest.fn().mockResolvedValue(ok([expired]));
    const invitationUpdate = jest.fn().mockResolvedValue(ok({ ...expired, status: "canceled" }));
    const removeOrganizationMember = jest.fn().mockResolvedValue(ok({ id: MEMBER_ID }));
    const listOrganizationMembers = jest.fn().mockResolvedValue(ok([]));
    const auth = new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {
          listExpiredPendingByOrganization,
          update: invitationUpdate,
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listOrganizationMembers,
          removeOrganizationMember,
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );

    const result = await auth.listOrganizationMembers(undefined, organizationCtx("owner"));

    expect(result.isOk()).toBe(true);
    expect(listExpiredPendingByOrganization).toHaveBeenCalledWith(ORG_ID);
    expect(removeOrganizationMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
    expect(invitationUpdate).toHaveBeenCalledWith({ id: INVITATION_ID, status: "canceled" });
    expect(listOrganizationMembers).toHaveBeenCalledWith(ORG_ID);
  });
});

describe("AuthService.inviteOrganizationMember resend and revive", () => {
  function createInviteAuthService(fakes: {
    findLiveMemberByEmail: AuthOrganizationRepository["findLiveMemberByEmail"];
    createInvitedMember: AuthOrganizationRepository["createInvitedMember"];
    invitationCreate: AuthInvitationRepository["create"];
    sendOrganizationInvite: EmailService["sendOrganizationInvite"];
    findPendingLeftoverByEmail?: AuthInvitationRepository["findPendingLeftoverByEmail"];
    findPendingByMemberId?: AuthInvitationRepository["findPendingByMemberId"];
    invitationUpdate?: AuthInvitationRepository["update"];
    findLeftMemberByEmail?: AuthOrganizationRepository["findLeftMemberByEmail"];
    reviveInvitedMember?: AuthOrganizationRepository["reviveInvitedMember"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {
          findById: jest
            .fn()
            .mockResolvedValue(ok({ id: "user-1", name: "Pat", email: "pat@example.com" })),
        } as unknown as AuthUserRepository,
        invitation: {
          findById: jest.fn(),
          update: fakes.invitationUpdate ?? jest.fn().mockResolvedValue(ok(pendingInvitation())),
          create: fakes.invitationCreate,
          findPendingByMemberId:
            fakes.findPendingByMemberId ?? jest.fn().mockResolvedValue(ok(null)),
          findPendingLeftoverByEmail:
            fakes.findPendingLeftoverByEmail ?? jest.fn().mockResolvedValue(ok([])),
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          findById: jest.fn().mockResolvedValue(ok({ id: ORG_ID, name: "Acme", locale: "en" })),
          findLiveMemberByEmail: fakes.findLiveMemberByEmail,
          createInvitedMember: fakes.createInvitedMember,
          findLeftMemberByEmail:
            fakes.findLeftMemberByEmail ?? jest.fn().mockResolvedValue(ok(null)),
          reviveInvitedMember: fakes.reviveInvitedMember ?? jest.fn(),
        } as unknown as AuthOrganizationRepository,
      },
      { email: { sendOrganizationInvite: fakes.sendOrganizationInvite } as EmailService },
      defaultAuthGrants,
      createFakeBus(),
      { web: WEB_URL, api: "https://api.example.com" }
    );
  }

  it("resends to a live invited email without creating a second Membership", async () => {
    const invitation = pendingInvitation();
    const refreshed = { ...invitation, expiresAt: new Date("2099-02-01T00:00:00.000Z") };
    const createInvitedMember = jest.fn();
    const invitationCreate = jest.fn();
    const invitationUpdate = jest.fn().mockResolvedValue(ok(refreshed));
    const sendOrganizationInvite = jest.fn().mockResolvedValue(ok(undefined));
    const auth = createInviteAuthService({
      findLiveMemberByEmail: jest.fn().mockResolvedValue(
        ok({
          id: MEMBER_ID,
          organizationId: ORG_ID,
          userId: null,
          email: "invitee@example.com",
          name: "invitee@example.com",
          role: "member",
        })
      ),
      createInvitedMember,
      invitationCreate,
      sendOrganizationInvite,
      findPendingByMemberId: jest.fn().mockResolvedValue(ok(invitation)),
      invitationUpdate,
    });

    const result = await auth.inviteOrganizationMember(
      { email: "invitee@example.com", role: "member" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.member.id).toBe(MEMBER_ID);
      expect(result.value.invitation.id).toBe(INVITATION_ID);
    }
    expect(createInvitedMember).not.toHaveBeenCalled();
    expect(invitationCreate).not.toHaveBeenCalled();
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: INVITATION_ID,
        email: "invitee@example.com",
      })
    );
    expect(sendOrganizationInvite).toHaveBeenCalled();
  });

  it("revives a left Member as invited with the same MemberId", async () => {
    const createInvitedMember = jest.fn();
    const reviveInvitedMember = jest.fn().mockResolvedValue(
      ok({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: null,
        email: "invitee@example.com",
        name: "invitee@example.com",
        role: "member",
      })
    );
    const invitationCreate = jest.fn().mockResolvedValue(
      ok({
        id: INVITATION_ID,
        organizationId: ORG_ID,
        email: "invitee@example.com",
        role: "member",
        status: "pending",
        memberId: MEMBER_ID,
        inviterId: "user-1",
        expiresAt: new Date("2099-02-01T00:00:00.000Z"),
      })
    );
    const sendOrganizationInvite = jest.fn().mockResolvedValue(ok(undefined));
    const auth = createInviteAuthService({
      findLiveMemberByEmail: jest.fn().mockResolvedValue(ok(null)),
      createInvitedMember,
      invitationCreate,
      sendOrganizationInvite,
      findLeftMemberByEmail: jest.fn().mockResolvedValue(
        ok({
          id: MEMBER_ID,
          organizationId: ORG_ID,
          userId: "user-invitee",
          email: "invitee@example.com",
          deletedAt: new Date("2026-02-01T00:00:00.000Z"),
        })
      ),
      reviveInvitedMember,
    });

    const result = await auth.inviteOrganizationMember(
      { email: "invitee@example.com", role: "member" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.member.id).toBe(MEMBER_ID);
    }
    expect(reviveInvitedMember).toHaveBeenCalledWith({
      memberId: MEMBER_ID,
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "member",
    });
    expect(createInvitedMember).not.toHaveBeenCalled();
    expect(invitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: MEMBER_ID, email: "invitee@example.com" })
    );
  });

  it("cancels a leftover pending token without memberId and creates Member plus a new Invitation", async () => {
    const leftover = pendingInvitation({ id: "legacy-invite", memberId: null });
    const findPendingLeftoverByEmail = jest.fn().mockResolvedValue(ok([leftover]));
    const invitationUpdate = jest.fn().mockResolvedValue(ok({ ...leftover, status: "canceled" }));
    const createInvitedMember = jest.fn().mockResolvedValue(
      ok({
        id: MEMBER_ID,
        organizationId: ORG_ID,
        userId: null,
        email: "invitee@example.com",
        name: "invitee@example.com",
        role: "member",
      })
    );
    const invitationCreate = jest.fn().mockResolvedValue(
      ok({
        id: INVITATION_ID,
        organizationId: ORG_ID,
        email: "invitee@example.com",
        role: "member",
        status: "pending",
        memberId: MEMBER_ID,
        inviterId: "user-1",
        expiresAt: new Date("2099-02-01T00:00:00.000Z"),
      })
    );
    const sendOrganizationInvite = jest.fn().mockResolvedValue(ok(undefined));
    const auth = createInviteAuthService({
      findLiveMemberByEmail: jest.fn().mockResolvedValue(ok(null)),
      createInvitedMember,
      invitationCreate,
      sendOrganizationInvite,
      findPendingLeftoverByEmail,
      invitationUpdate,
    });

    const result = await auth.inviteOrganizationMember(
      { email: "invitee@example.com", role: "member" },
      organizationCtx("owner")
    );

    expect(result.isOk()).toBe(true);
    expect(invitationUpdate).toHaveBeenCalledWith({ id: "legacy-invite", status: "canceled" });
    expect(createInvitedMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "member",
    });
    expect(invitationCreate).toHaveBeenCalledWith(expect.objectContaining({ memberId: MEMBER_ID }));
  });
});
