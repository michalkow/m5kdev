import { ok } from "neverthrow";
import { createServiceActor } from "../../base/base.actor";
import type { ServerEventBus } from "../../base/server-event";
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

const USER_ID = "user-1";

function createFakeBus(): ServerEventBus {
  return {
    emit() {},
    batchEmit() {},
    attach() {},
    close() {},
  };
}

function userCtx() {
  return {
    actor: createServiceActor({
      userId: USER_ID,
      userRole: "user",
    }),
    user: { id: USER_ID, email: "pat@example.com", name: "Pat", locale: "en" },
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

function mintedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "waitlist-code-1",
    name: "Open link",
    email: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: null,
    status: "INVITED",
    code: "minted-code",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    userId: USER_ID,
    ...overrides,
  };
}

function emailedRow(overrides: Record<string, unknown> = {}) {
  return mintedRow({
    id: "waitlist-email-1",
    email: "friend@example.com",
    name: "Friend",
    code: "email-code",
    ...overrides,
  });
}

describe("AuthService Waitlist codes", () => {
  function createAuth(fakes: {
    getUserWaitlistCount?: AuthWaitlistRepository["getUserWaitlistCount"];
    getUserWaitlistCodeCount?: AuthWaitlistRepository["getUserWaitlistCodeCount"];
    createWaitlistCode?: AuthWaitlistRepository["createWaitlistCode"];
    inviteToWaitlist?: AuthWaitlistRepository["inviteToWaitlist"];
    queryList?: AuthWaitlistRepository["queryList"];
    create?: AuthWaitlistRepository["create"];
  }): AuthService {
    return new AuthService(
      {
        accountClaim: {} as AuthAccountClaimRepository,
        user: {} as AuthUserRepository,
        invitation: {} as AuthInvitationRepository,
        waitlist: {
          getUserWaitlistCount:
            fakes.getUserWaitlistCount ?? jest.fn().mockResolvedValue(ok(0)),
          getUserWaitlistCodeCount:
            fakes.getUserWaitlistCodeCount ?? jest.fn().mockResolvedValue(ok(0)),
          createWaitlistCode:
            fakes.createWaitlistCode ?? jest.fn().mockResolvedValue(ok(mintedRow())),
          inviteToWaitlist:
            fakes.inviteToWaitlist ?? jest.fn().mockResolvedValue(ok(emailedRow())),
          queryList: fakes.queryList ?? jest.fn().mockResolvedValue(ok({ rows: [] })),
          create: fakes.create ?? jest.fn().mockResolvedValue(ok({ id: "join-1", email: "a@b.c" })),
        } as unknown as AuthWaitlistRepository,
        organization: {} as AuthOrganizationRepository,
      },
      {
        email: {
          sendWaitlistUserInvite: jest.fn().mockResolvedValue(ok(undefined)),
          sendWaitlistConfirmation: jest.fn().mockResolvedValue(ok(undefined)),
          sendSystemWaitlistNotification: jest.fn().mockResolvedValue(ok(undefined)),
        } as unknown as EmailService,
      },
      defaultAuthGrants,
      createFakeBus()
    );
  }

  it("caps minted Waitlist codes at 3 per User without consuming inviteToWaitlist quota", async () => {
    const createWaitlistCode = jest.fn().mockResolvedValue(ok(mintedRow()));
    const inviteToWaitlist = jest.fn().mockResolvedValue(ok(emailedRow()));
    const auth = createAuth({
      getUserWaitlistCodeCount: jest.fn().mockResolvedValue(ok(3)),
      getUserWaitlistCount: jest.fn().mockResolvedValue(ok(0)),
      createWaitlistCode,
      inviteToWaitlist,
    });

    const minted = await auth.createWaitlistCode({ name: "Open" }, userCtx());
    expect(minted.isErr()).toBe(true);
    if (minted.isErr()) {
      expect(minted.error.code).toBe("BAD_REQUEST");
    }
    expect(createWaitlistCode).not.toHaveBeenCalled();

    const invited = await auth.inviteToWaitlist(
      { email: "friend@example.com", name: "Friend" },
      userCtx()
    );
    expect(invited.isOk()).toBe(true);
    expect(inviteToWaitlist).toHaveBeenCalled();
  });

  it("keeps inviteToWaitlist capped at 3 independently of minted codes", async () => {
    const createWaitlistCode = jest.fn().mockResolvedValue(ok(mintedRow()));
    const inviteToWaitlist = jest.fn().mockResolvedValue(ok(emailedRow()));
    const auth = createAuth({
      getUserWaitlistCount: jest.fn().mockResolvedValue(ok(3)),
      getUserWaitlistCodeCount: jest.fn().mockResolvedValue(ok(0)),
      createWaitlistCode,
      inviteToWaitlist,
    });

    const invited = await auth.inviteToWaitlist({ email: "friend@example.com" }, userCtx());
    expect(invited.isErr()).toBe(true);
    if (invited.isErr()) {
      expect(invited.error.code).toBe("BAD_REQUEST");
    }
    expect(inviteToWaitlist).not.toHaveBeenCalled();

    const minted = await auth.createWaitlistCode({}, userCtx());
    expect(minted.isOk()).toBe(true);
    expect(createWaitlistCode).toHaveBeenCalledWith({ userId: USER_ID, name: undefined });
  });

  it("includes code on own minted list and omits code from admin people list", async () => {
    const ownQueryList = jest.fn().mockResolvedValue(ok({ rows: [mintedRow()], total: 1 }));
    const adminQueryList = jest.fn().mockResolvedValue(
      ok({
        rows: [{ id: "w1", email: "a@b.c", name: "A", createdAt: new Date(), updatedAt: null, status: "WAITLIST" }],
        total: 1,
      })
    );
    const ownAuth = createAuth({ queryList: ownQueryList });
    const adminAuth = createAuth({ queryList: adminQueryList });

    const own = await ownAuth.listWaitlist({}, userCtx());
    expect(own.isOk()).toBe(true);
    if (own.isOk()) {
      expect(own.value[0]).toEqual(expect.objectContaining({ code: "minted-code" }));
    }

    const admin = await adminAuth.listAdminWaitlist(undefined, adminCtx());
    expect(admin.isOk()).toBe(true);
    expect(adminQueryList).toHaveBeenCalled();
    const adminOptions = adminQueryList.mock.calls[0]?.[1] as { columns?: string[] } | undefined;
    expect(adminOptions?.columns).not.toContain("code");
    if (admin.isOk()) {
      expect(admin.value[0]).not.toHaveProperty("code");
    }
  });

  it("does not return a code when joining the Waitlist", async () => {
    const create = jest.fn().mockResolvedValue(
      ok({
        id: "join-1",
        email: "join@example.com",
        name: null,
        status: "WAITLIST",
        code: "should-not-leak",
        createdAt: new Date(),
        updatedAt: null,
        expiresAt: null,
        userId: null,
      })
    );
    const auth = createAuth({ create });

    const result = await auth.joinWaitlist({ email: "join@example.com" }, {} as never);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).not.toHaveProperty("code");
    }
  });
});
