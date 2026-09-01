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

const CLAIM_ID = "claim-1";
const USER_ID = "user-provisioned";

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

function userCtx() {
  return {
    actor: createServiceActor({
      userId: USER_ID,
      userRole: "user",
    }),
    user: { id: USER_ID, email: "provisioned@example.com", name: "Pat" },
  } as never;
}

const pendingClaim = {
  id: CLAIM_ID,
  claimUserId: USER_ID,
  status: "INVITED",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  claimedAt: null,
  claimedEmail: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: null,
};

describe("AuthService Account claim", () => {
  function createAuth(fakes: {
    createAccountClaimCode?: AuthAccountClaimRepository["createAccountClaimCode"];
    queryList?: AuthAccountClaimRepository["queryList"];
    findPendingAccountClaimForUser?: AuthAccountClaimRepository["findPendingAccountClaimForUser"];
    acceptAccountClaim?: AuthAccountClaimRepository["acceptAccountClaim"];
  }): {
    auth: AuthService;
    waitlist: AuthWaitlistRepository;
  } {
    const waitlist = {
      createAccountClaimCode: jest.fn(),
      queryList: jest.fn(),
      findPendingAccountClaimForUser: jest.fn(),
      acceptAccountClaim: jest.fn(),
    } as unknown as AuthWaitlistRepository;
    const auth = new AuthService(
      {
        accountClaim: {
          createAccountClaimCode:
            fakes.createAccountClaimCode ?? jest.fn().mockResolvedValue(ok(pendingClaim)),
          queryList: fakes.queryList ?? jest.fn().mockResolvedValue(ok({ rows: [pendingClaim] })),
          findPendingAccountClaimForUser:
            fakes.findPendingAccountClaimForUser ?? jest.fn().mockResolvedValue(ok(pendingClaim)),
          acceptAccountClaim: fakes.acceptAccountClaim ?? jest.fn().mockResolvedValue(ok({ status: true })),
        } as unknown as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist,
        organization: {} as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus()
    );
    return { auth, waitlist };
  }

  it("creates an Account claim without a Waitlist type discriminator", async () => {
    const createAccountClaimCode = jest.fn().mockResolvedValue(ok(pendingClaim));
    const { auth, waitlist } = createAuth({ createAccountClaimCode });

    const result = await auth.createAccountClaimCode({ userId: USER_ID }, adminCtx());

    expect(result.isOk()).toBe(true);
    expect(createAccountClaimCode).toHaveBeenCalledWith({ userId: USER_ID });
    expect(waitlist.createAccountClaimCode).not.toHaveBeenCalled();
  });

  it("lists Account claims from the Account claim table, not Waitlist type", async () => {
    const queryList = jest.fn().mockResolvedValue(ok({ rows: [pendingClaim], total: 1 }));
    const { auth, waitlist } = createAuth({ queryList });

    const result = await auth.listAccountClaims(undefined, adminCtx());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([pendingClaim]);
    }
    expect(queryList).toHaveBeenCalled();
    const listInput = queryList.mock.calls[0]?.[0] as { filters?: unknown[] } | undefined;
    expect(JSON.stringify(listInput?.filters ?? [])).not.toContain("ACCOUNT_CLAIM");
    expect(waitlist.queryList).not.toHaveBeenCalled();
  });

  it("reads and accepts the pending Account claim without Waitlist type", async () => {
    const findPendingAccountClaimForUser = jest.fn().mockResolvedValue(ok(pendingClaim));
    const acceptAccountClaim = jest.fn().mockResolvedValue(ok({ status: true }));
    const { auth, waitlist } = createAuth({
      findPendingAccountClaimForUser,
      acceptAccountClaim,
    });

    const status = await auth.getMyAccountClaimStatus(undefined, userCtx());
    const accepted = await auth.acceptMyAccountClaim(undefined, userCtx());

    expect(status.isOk()).toBe(true);
    expect(accepted.isOk()).toBe(true);
    expect(findPendingAccountClaimForUser).toHaveBeenCalledWith(USER_ID);
    expect(acceptAccountClaim).toHaveBeenCalledWith(USER_ID);
    expect(waitlist.findPendingAccountClaimForUser).not.toHaveBeenCalled();
    expect(waitlist.acceptAccountClaim).not.toHaveBeenCalled();
  });
});
