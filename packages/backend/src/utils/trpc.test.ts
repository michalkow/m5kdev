import { TRPCError } from "@trpc/server";
import type { BetterAuth, Session, User } from "../modules/auth/auth.lib";
import type { UserActor } from "../modules/base/base.actor";
import type { RequestContext } from "./trpc";
import {
  createAuthContext,
  requireRequestActor,
  requireRequestUser,
  verifyAdminProcedureContext,
} from "./trpc";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  fromNodeHeaders: (headers: unknown) => headers,
}));

function expectTRPCCode(fn: () => unknown, code: TRPCError["code"]) {
  try {
    fn();
    throw new Error(`Expected TRPC error with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe(code);
  }
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    role: "member",
    email: "user@example.com",
    emailVerified: true,
    name: "User One",
    createdAt: new Date(),
    updatedAt: new Date(),
    onboarding: null,
    preferences: null,
    flags: null,
    stripeCustomerId: null,
    paymentCustomerId: null,
    paymentPlanTier: null,
    paymentPlanExpiresAt: null,
    ...overrides,
  } as User;
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "token",
    ipAddress: null,
    userAgent: null,
    activeOrganizationId: null,
    activeOrganizationRole: null,
    activeTeamId: null,
    activeTeamRole: null,
    ...overrides,
  } as Session;
}

function createRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const user = overrides.user ?? createUser();
  const session = overrides.session ?? createSession();
  const actor =
    overrides.actor ??
    (user && session
      ? ({
          userId: user.id,
          userRole: user.role!,
          organizationId: session.activeOrganizationId,
          organizationRole: session.activeOrganizationRole,
          teamId: session.activeTeamId,
          teamRole: session.activeTeamRole,
        } satisfies UserActor)
      : null);

  return {
    user,
    session,
    actor,
    ...overrides,
  };
}

describe("trpc auth helpers", () => {
  it("stores a user-scoped actor on the request context while copying session ids", async () => {
    const user = createUser();
    const session = createSession({
      activeOrganizationId: "org-1",
      activeOrganizationRole: "owner",
      activeTeamId: "team-1",
      activeTeamRole: "manager",
    });

    const auth = {
      api: {
        getSession: jest.fn().mockResolvedValue({ user, session }),
      },
    } as unknown as BetterAuth;

    const createContext = createAuthContext(auth);
    const ctx = await createContext({
      req: { headers: {} },
    } as never);

    expect(ctx.actor).toEqual({
      userId: "user-1",
      userRole: "member",
      organizationId: "org-1",
      organizationRole: "owner",
      teamId: "team-1",
      teamRole: "manager",
    });
  });

  it("throws FORBIDDEN when a broader actor scope is required than the session allows", () => {
    const actor = requireRequestActor(
      createRequestContext({
        user: createUser(),
        session: createSession(),
        actor: {
          userId: "user-1",
          userRole: "member",
          organizationId: null,
          organizationRole: null,
          teamId: null,
          teamRole: null,
        },
      })
    );

    expect(actor.userId).toBe("user-1");

    expectTRPCCode(
      () =>
        requireRequestActor(
          createRequestContext({
            user: createUser(),
            session: createSession(),
            actor: {
              userId: "user-1",
              userRole: "member",
              organizationId: null,
              organizationRole: null,
              teamId: null,
              teamRole: null,
            },
          }),
          "organization"
        ),
      "FORBIDDEN"
    );
  });

  it("throws UNAUTHORIZED when request user access is missing", () => {
    expectTRPCCode(
      () =>
        requireRequestUser({
          user: null,
          session: null,
          actor: null,
        }),
      "UNAUTHORIZED"
    );
  });

  it("verifies admin access from the raw request user", () => {
    const ctx = createRequestContext({
      user: createUser({ role: "admin" }),
      actor: {
        userId: "user-1",
        userRole: "admin",
        organizationId: "org-1",
        organizationRole: "owner",
        teamId: null,
        teamRole: null,
      },
    });

    expect(verifyAdminProcedureContext(ctx).user.role).toBe("admin");
    expectTRPCCode(
      () =>
        verifyAdminProcedureContext(
          createRequestContext({
            user: createUser({ role: "member" }),
            actor: ctx.actor,
          })
        ),
      "FORBIDDEN"
    );
  });
});
