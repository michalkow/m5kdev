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

const ENTERPRISE_ORG_ID = "org-enterprise";
const PLAIN_ORG_ID = "org-plain";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

function createChildAuth(fakes: {
  findById: AuthOrganizationRepository["findById"];
  queryList: AuthOrganizationRepository["queryList"];
}): AuthService {
  return new AuthService(
    {
      accountClaim: {} as AuthAccountClaimRepository,
      user: {} as AuthUserRepository,
      invitation: {} as AuthInvitationRepository,
      waitlist: {} as AuthWaitlistRepository,
      organization: {
        findById: fakes.findById,
        queryList: fakes.queryList,
      } as unknown as AuthOrganizationRepository,
    },
    { email: {} as EmailService },
    defaultAuthGrants,
    createFakeBus()
  );
}

function createCreateAuth(fakes: {
  findById: AuthOrganizationRepository["findById"];
  createOrganization: AuthOrganizationRepository["createOrganization"];
  userFindById: AuthUserRepository["findById"];
}): AuthService {
  return new AuthService(
    {
      accountClaim: {} as AuthAccountClaimRepository,
      user: { findById: fakes.userFindById } as unknown as AuthUserRepository,
      invitation: {} as AuthInvitationRepository,
      waitlist: {} as AuthWaitlistRepository,
      organization: {
        findById: fakes.findById,
        createOrganization: fakes.createOrganization,
      } as unknown as AuthOrganizationRepository,
    },
    { email: {} as EmailService },
    defaultAuthGrants,
    createFakeBus()
  );
}

describe("AuthService.listChildOrganizations parent authorization", () => {
  it("forbids acting from a non-enterprise actor organization even when the session names an enterprise organization", async () => {
    const findById = jest.fn().mockResolvedValue(ok({ id: PLAIN_ORG_ID, type: "organization" }));
    const queryList = jest.fn();
    const auth = createChildAuth({ findById, queryList });

    const result = await auth.listChildOrganizations({}, {
      actor: createServiceActor({
        userId: "user-1",
        userRole: "user",
        organizationId: PLAIN_ORG_ID,
        organizationRole: "owner",
        memberId: "member-1",
      }),
      session: {
        activeOrganizationId: ENTERPRISE_ORG_ID,
        activeOrganizationType: "enterprise",
        activeOrganizationRole: "owner",
      },
      user: { id: "user-1" },
    } as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toBe(
        "You are not allowed to manage child organizations in this organization type"
      );
    }
    expect(findById).toHaveBeenCalledWith(PLAIN_ORG_ID, undefined, ["type"]);
    expect(queryList).not.toHaveBeenCalled();
  });

  it("allows a cookieless actor with an owner role on an enterprise organization", async () => {
    const findById = jest.fn().mockResolvedValue(ok({ id: ENTERPRISE_ORG_ID, type: "enterprise" }));
    const queryList = jest.fn().mockResolvedValue(ok({ rows: [], total: 0 }));
    const auth = createChildAuth({ findById, queryList });

    const result = await auth.listChildOrganizations({}, {
      actor: createServiceActor({
        userId: "user-1",
        userRole: "user",
        organizationId: ENTERPRISE_ORG_ID,
        organizationRole: "owner",
        memberId: "member-1",
      }),
      session: null,
      user: { id: "user-1" },
    } as never);

    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
    expect(findById).toHaveBeenCalledWith(ENTERPRISE_ORG_ID, undefined, ["type"]);
    expect(queryList).toHaveBeenCalled();
  });
});

describe("AuthService.createOrganization parent authorization", () => {
  it("forbids creating from a non-enterprise actor organization even when the session names an enterprise organization", async () => {
    const findById = jest.fn().mockResolvedValue(ok({ id: PLAIN_ORG_ID, type: "organization" }));
    const createOrganization = jest.fn();
    const userFindById = jest.fn().mockResolvedValue(ok({ id: "user-1", locale: "en" }));
    const auth = createCreateAuth({ findById, createOrganization, userFindById });

    const result = await auth.createOrganization({ name: "Child" }, {
      actor: createServiceActor({
        userId: "user-1",
        userRole: "user",
        organizationId: PLAIN_ORG_ID,
        organizationRole: "owner",
        memberId: "member-1",
      }),
      session: {
        activeOrganizationId: ENTERPRISE_ORG_ID,
        activeOrganizationType: "enterprise",
        activeOrganizationRole: "owner",
      },
      user: { id: "user-1" },
    } as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toBe("You are not allowed to create an organization");
    }
    expect(findById).toHaveBeenCalledWith(PLAIN_ORG_ID, undefined, ["type"]);
    expect(createOrganization).not.toHaveBeenCalled();
  });
});
