import { ok } from "neverthrow";
import { createServiceActor } from "../../../base/base.actor";
import type { ServerEventBus } from "../../../base/server-event";
import type { BillingService } from "../../billing/billing.service";
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
const OWNER_MEMBER_ID = "member-owner";
const MEMBER_ID = "member-1";
const INVITE_ID = "invite-1";
const ORG_ID = "org-1";
const CHILD_ID = "org-child";
const ORG_NAME = "Acme";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

function orgCtx(overrides: { organizationRole?: string } = {}) {
  return {
    actor: createServiceActor({
      userId: USER_ID,
      userRole: "user",
      organizationId: ORG_ID,
      organizationRole: overrides.organizationRole ?? "owner",
      memberId: OWNER_MEMBER_ID,
    }),
    user: { id: USER_ID, email: "pat@example.com", name: "Pat", role: "user" },
    session: { id: "session-1", userId: USER_ID, activeOrganizationId: ORG_ID },
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

function liveOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    name: ORG_NAME,
    slug: "acme",
    closedAt: null,
    parentId: null,
    ...overrides,
  };
}

describe("AuthService.closeOrganization", () => {
  function createCloseAuth(fakes: {
    findById: AuthOrganizationRepository["findById"];
    update: AuthOrganizationRepository["update"];
    listLiveChildOrganizations?: AuthOrganizationRepository["listLiveChildOrganizations"];
    listChildOrganizations?: AuthOrganizationRepository["listChildOrganizations"];
    listLiveNonOwnerMembers?: AuthOrganizationRepository["listLiveNonOwnerMembers"];
    removeOrganizationMember?: AuthOrganizationRepository["removeOrganizationMember"];
    listPendingInvitations?: AuthInvitationRepository["listPendingByOrganization"];
    cancelInvitation?: AuthInvitationRepository["update"];
    clearActiveOrganizationSessions?: AuthOrganizationRepository["clearActiveOrganizationSessions"];
    billing?: Pick<BillingService, "cancelOrganizationSubscription">;
    purgeOrganization?: AuthOrganizationRepository["purgeOrganization"];
    hooks?: ConstructorParameters<typeof AuthService>[5];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {
          listPendingByOrganization:
            fakes.listPendingInvitations ?? jest.fn().mockResolvedValue(ok([])),
          update: fakes.cancelInvitation ?? jest.fn().mockResolvedValue(ok({ id: INVITE_ID })),
        } as unknown as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          findById: fakes.findById,
          update: fakes.update,
          listLiveChildOrganizations:
            fakes.listLiveChildOrganizations ?? jest.fn().mockResolvedValue(ok([])),
          listChildOrganizations:
            fakes.listChildOrganizations ?? jest.fn().mockResolvedValue(ok([])),
          listOrganizationMembers: jest.fn().mockResolvedValue(ok([{ userId: "owner-1" }])),
          listLiveNonOwnerMembers:
            fakes.listLiveNonOwnerMembers ?? jest.fn().mockResolvedValue(ok([])),
          removeOrganizationMember:
            fakes.removeOrganizationMember ?? jest.fn().mockResolvedValue(ok({ id: MEMBER_ID })),
          clearActiveOrganizationSessions:
            fakes.clearActiveOrganizationSessions ?? jest.fn().mockResolvedValue(ok(undefined)),
          purgeOrganization:
            fakes.purgeOrganization ?? jest.fn().mockResolvedValue(ok({ id: ORG_ID })),
        } as unknown as AuthOrganizationRepository,
      },
      fakes.billing
        ? { email: {} as EmailService, billing: fakes.billing as BillingService }
        : { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus(),
      undefined,
      fakes.hooks
    );
  }

  it("Closes an Organization when the Owner types the name", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const clearActiveOrganizationSessions = jest.fn().mockResolvedValue(ok(undefined));
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update: jest.fn().mockResolvedValue(ok(liveOrg({ closedAt }))),
      clearActiveOrganizationSessions,
    });

    const result = await auth.closeOrganization({ name: ORG_NAME }, orgCtx());

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ id: ORG_ID, closedAt });
    expect(clearActiveOrganizationSessions).toHaveBeenCalledWith(ORG_ID);
  });

  it("refuses Close when the typed name does not match", async () => {
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update: jest.fn(),
    });

    const result = await auth.closeOrganization({ name: "Other" }, orgCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Type the Organization name to confirm");
  });

  it("refuses Close for an Organization Role admin", async () => {
    const update = jest.fn();
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update,
    });

    const result = await auth.closeOrganization({ name: ORG_NAME }, orgCtx({ organizationRole: "admin" }));

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("FORBIDDEN");
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves non-Owner Memberships and pending invites, keeps the Owner seat, and does not revive them on Restore", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const removeOrganizationMember = jest.fn().mockResolvedValue(ok({ id: MEMBER_ID }));
    const cancelInvitation = jest.fn().mockResolvedValue(ok({ id: INVITE_ID }));
    const update = jest
      .fn()
      .mockResolvedValueOnce(ok(liveOrg({ closedAt })))
      .mockResolvedValueOnce(ok(liveOrg({ closedAt: null })));
    const auth = createCloseAuth({
      findById: jest
        .fn()
        .mockResolvedValueOnce(ok(liveOrg()))
        .mockResolvedValueOnce(ok(liveOrg({ closedAt }))),
      update,
      listLiveNonOwnerMembers: jest.fn().mockResolvedValue(
        ok([
          {
            id: MEMBER_ID,
            organizationId: ORG_ID,
            userId: "user-2",
            role: "member",
          },
        ])
      ),
      removeOrganizationMember,
      listPendingInvitations: jest.fn().mockResolvedValue(
        ok([{ id: INVITE_ID, organizationId: ORG_ID, memberId: null, status: "pending" }])
      ),
      cancelInvitation,
    });

    const closed = await auth.closeOrganization({ name: ORG_NAME }, orgCtx());
    expect(closed.isOk()).toBe(true);
    expect(removeOrganizationMember).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
    expect(cancelInvitation).toHaveBeenCalledWith({ id: INVITE_ID, status: "canceled" });

    const restored = await auth.restoreOrganization({ id: ORG_ID }, adminCtx());
    expect(restored.isOk()).toBe(true);
    if (restored.isErr()) return;
    expect(restored.value).toEqual({ id: ORG_ID, closedAt: null });
    expect(removeOrganizationMember).toHaveBeenCalledTimes(1);
    expect(cancelInvitation).toHaveBeenCalledTimes(1);
  });

  it("refuses Close while a child Organization is live", async () => {
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update: jest.fn(),
      listLiveChildOrganizations: jest.fn().mockResolvedValue(ok([{ id: CHILD_ID, name: "Child" }])),
    });

    const result = await auth.closeOrganization({ name: ORG_NAME }, orgCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Close child Organizations first");
  });

  it("cancels the Stripe Subscription when Billing is wired", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const cancelOrganizationSubscription = jest.fn().mockResolvedValue(ok(true));
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update: jest.fn().mockResolvedValue(ok(liveOrg({ closedAt }))),
      billing: { cancelOrganizationSubscription },
    });

    const result = await auth.closeOrganization({ name: ORG_NAME }, orgCtx());

    expect(result.isOk()).toBe(true);
    expect(cancelOrganizationSubscription).toHaveBeenCalledWith({ organizationId: ORG_ID });
  });

  it("lets an AdminActor Close an Organization without typing the name", async () => {
    const closedAt = new Date("2026-10-10T12:00:00.000Z");
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update: jest.fn().mockResolvedValue(ok(liveOrg({ closedAt }))),
    });

    const result = await auth.adminCloseOrganization({ id: ORG_ID }, adminCtx());

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ id: ORG_ID, closedAt });
  });

  it("refuses Purge of an Organization that is not Closed", async () => {
    const purgeOrganization = jest.fn();
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg())),
      update: jest.fn(),
      purgeOrganization,
    });

    const result = await auth.purgeOrganization({ id: ORG_ID }, adminCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("This Organization is not Closed");
    expect(purgeOrganization).not.toHaveBeenCalled();
  });

  it("refuses Purge while a child Organization still exists", async () => {
    const purgeOrganization = jest.fn();
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg({ closedAt: new Date() }))),
      update: jest.fn(),
      listChildOrganizations: jest.fn().mockResolvedValue(ok([{ id: CHILD_ID, name: "Child" }])),
      purgeOrganization,
    });

    const result = await auth.purgeOrganization({ id: ORG_ID }, adminCtx());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toBe("Purge child Organizations first");
    expect(purgeOrganization).not.toHaveBeenCalled();
  });

  it("Purges an Organization and runs afterPurgeOrganization", async () => {
    const afterPurgeOrganization = jest.fn().mockResolvedValue(undefined);
    const purgeOrganization = jest.fn().mockResolvedValue(ok({ id: ORG_ID }));
    const auth = createCloseAuth({
      findById: jest.fn().mockResolvedValue(ok(liveOrg({ closedAt: new Date() }))),
      update: jest.fn(),
      purgeOrganization,
      hooks: { afterPurgeOrganization },
    });

    const result = await auth.purgeOrganization({ id: ORG_ID }, adminCtx());

    expect(result.isOk()).toBe(true);
    expect(afterPurgeOrganization).toHaveBeenCalled();
    expect(purgeOrganization).toHaveBeenCalledWith(ORG_ID);
  });
});
