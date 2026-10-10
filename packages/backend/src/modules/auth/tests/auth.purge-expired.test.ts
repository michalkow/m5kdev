import { ok } from "neverthrow";
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

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ID = "user-1";
const ORG_ID = "org-1";
const CHILD_ID = "org-child";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

describe("AuthService.purgeExpired", () => {
  function createAuth(fakes: {
    listClosedOrganizationsBefore?: AuthOrganizationRepository["listClosedOrganizationsBefore"];
    listLiveChildOrganizations?: AuthOrganizationRepository["listLiveChildOrganizations"];
    listChildOrganizations?: AuthOrganizationRepository["listChildOrganizations"];
    listClosedUsersBefore?: AuthUserRepository["listClosedUsersBefore"];
    listOwnedOrganizations?: AuthOrganizationRepository["listOwnedOrganizations"];
    purgeOrganization?: AuthOrganizationRepository["purgeOrganization"];
    purgeUser?: AuthUserRepository["purgeUser"];
    closeAfterDays?: number;
    hooks?: ConstructorParameters<typeof AuthService>[5];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {
          listClosedUsersBefore: fakes.listClosedUsersBefore ?? jest.fn().mockResolvedValue(ok([])),
          purgeUser: fakes.purgeUser ?? jest.fn().mockResolvedValue(ok({ id: USER_ID })),
        } as unknown as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist: {} as AuthWaitlistRepository,
        organization: {
          listClosedOrganizationsBefore:
            fakes.listClosedOrganizationsBefore ?? jest.fn().mockResolvedValue(ok([])),
          listLiveChildOrganizations:
            fakes.listLiveChildOrganizations ?? jest.fn().mockResolvedValue(ok([])),
          listChildOrganizations:
            fakes.listChildOrganizations ?? jest.fn().mockResolvedValue(ok([])),
          listOrganizationMembers: jest.fn().mockResolvedValue(ok([{ userId: USER_ID }])),
          listOwnedOrganizations:
            fakes.listOwnedOrganizations ?? jest.fn().mockResolvedValue(ok([])),
          purgeOrganization:
            fakes.purgeOrganization ?? jest.fn().mockResolvedValue(ok({ id: ORG_ID })),
        } as unknown as AuthOrganizationRepository,
      },
      { email: {} as EmailService },
      defaultAuthGrants,
      createFakeBus(),
      undefined,
      fakes.hooks,
      undefined,
      undefined,
      undefined,
      fakes.closeAfterDays ?? 30
    );
  }

  it("keeps Closed rows inside the grace window", async () => {
    const listClosedOrganizationsBefore = jest.fn().mockResolvedValue(ok([]));
    const listClosedUsersBefore = jest.fn().mockResolvedValue(ok([]));
    const auth = createAuth({ listClosedOrganizationsBefore, listClosedUsersBefore });

    const result = await auth.purgeExpired();

    expect(result.isOk()).toBe(true);
    expect(listClosedOrganizationsBefore).toHaveBeenCalled();
    const cutoff = listClosedOrganizationsBefore.mock.calls[0][0] as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(29 * DAY_MS);
    expect(listClosedUsersBefore).toHaveBeenCalledWith(cutoff);
  });

  it("Purges Organizations past grace, children before parents", async () => {
    const purged = new Set<string>();
    const purgeOrganization = jest.fn().mockImplementation(async (id: string) => {
      purged.add(id);
      return ok({ id });
    });
    const listChildOrganizations = jest.fn().mockImplementation(async (id: string) => {
      if (id === ORG_ID && !purged.has(CHILD_ID)) {
        return ok([{ id: CHILD_ID, name: "Child" }]);
      }
      return ok([]);
    });
    const auth = createAuth({
      listClosedOrganizationsBefore: jest.fn().mockResolvedValue(
        ok([
          { id: ORG_ID, parentId: null, name: "Acme", closedAt: new Date() },
          { id: CHILD_ID, parentId: ORG_ID, name: "Child", closedAt: new Date() },
        ])
      ),
      listChildOrganizations,
      purgeOrganization,
    });

    const result = await auth.purgeExpired();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.organizations).toBe(2);
    expect(purgeOrganization.mock.calls.map((call) => call[0])).toEqual([CHILD_ID, ORG_ID]);
  });

  it("Purges Users past grace and skips a User who still Owns an Organization", async () => {
    const purgeUser = jest.fn().mockResolvedValue(ok({ id: "user-2" }));
    const afterPurgeUser = jest.fn().mockResolvedValue(undefined);
    const auth = createAuth({
      listClosedUsersBefore: jest.fn().mockResolvedValue(
        ok([
          { id: USER_ID, closedAt: new Date() },
          { id: "user-2", closedAt: new Date() },
        ])
      ),
      listOwnedOrganizations: jest.fn().mockImplementation(async (id: string) => {
        if (id === USER_ID) return ok([{ id: ORG_ID, name: "Acme" }]);
        return ok([]);
      }),
      purgeUser,
      hooks: { afterPurgeUser },
    });

    const result = await auth.purgeExpired();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.users).toBe(1);
    expect(purgeUser).toHaveBeenCalledTimes(1);
    expect(purgeUser).toHaveBeenCalledWith("user-2");
    expect(afterPurgeUser).toHaveBeenCalled();
  });
});
