import { TRPCError } from "@trpc/server";
import { err, ok } from "neverthrow";
import { z } from "zod";
import type { MembershipLookup } from "../base/base.actor";
import type { BetterAuth, Session, User } from "../modules/auth/auth.lib";
import type { UserActor } from "../modules/base/base.actor";
import { ServerError } from "./errors";
import type { RequestContext } from "./trpc";
import {
  createAuthContext,
  createTRPCMethods,
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
    activeOrganizationMemberId: null,
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
          memberId: session.activeOrganizationMemberId,
          teamId: null,
          teamRole: null,
        } satisfies UserActor)
      : null);

  return {
    user,
    session,
    actor,
    ...overrides,
  };
}

function createMemberships(
  members: Record<string, { id: string; role: string; userId?: string | null }>
): MembershipLookup {
  return {
    findMemberByUserAndOrganization: async ({ userId, organizationId }) => {
      const member = members[organizationId];
      if (!member) {
        return err(
          new ServerError({
            code: "NOT_FOUND",
            layer: "repository",
            layerName: "MembershipFixture",
            message: "Member not found",
          })
        );
      }
      return ok({ userId, ...member });
    },
  };
}

function createOrganizationCaller(memberships: MembershipLookup) {
  const { router, organizationProcedure, createCallerFactory } = createTRPCMethods({
    memberships,
  });
  const appRouter = router({
    run: organizationProcedure
      .input(z.object({ title: z.string() }))
      .query(({ ctx, input }) => ({ actor: ctx.actor, input })),
    patch: organizationProcedure
      .input(z.record(z.string(), z.unknown()))
      .mutation(({ input }) => input),
    bare: organizationProcedure.query(({ ctx, input }) => ({
      organizationId: ctx.actor.organizationId,
      input,
    })),
  });
  return createCallerFactory(appRouter);
}

const sessionOrgActor = {
  userId: "user-1",
  userRole: "member",
  organizationId: "org-1",
  organizationRole: "owner",
  memberId: "member-1",
  teamId: null,
  teamRole: null,
} satisfies UserActor;

describe("organizationProcedure", () => {
  it("builds OrganizationActor from a live Membership for the session active Organization", async () => {
    const caller = createOrganizationCaller(
      createMemberships({ "org-1": { id: "member-1", role: "member" } })
    )(
      createRequestContext({
        session: createSession({
          activeOrganizationId: "org-1",
          activeOrganizationRole: "owner",
          activeOrganizationMemberId: "member-1",
        }),
      })
    );

    await expect(caller.run({ title: "Hello" })).resolves.toEqual({
      input: { title: "Hello" },
      actor: { ...sessionOrgActor, organizationRole: "member" },
    });
  });

  it("lets input organizationId win over the session active Organization", async () => {
    const caller = createOrganizationCaller(
      createMemberships({
        "org-1": { id: "member-1", role: "owner" },
        "org-2": { id: "member-2", role: "admin" },
      })
    )(
      createRequestContext({
        session: createSession({ activeOrganizationId: "org-1" }),
        actor: sessionOrgActor,
      })
    );

    await expect(caller.bare({ organizationId: "org-2" })).resolves.toEqual({
      organizationId: "org-2",
      input: undefined,
    });
  });

  it("keeps an existing OrganizationActor when nothing names an Organization", async () => {
    const caller = createOrganizationCaller(createMemberships({}))({
      user: createUser(),
      session: null,
      actor: sessionOrgActor,
    });

    await expect(caller.run({ title: "Hello" })).resolves.toEqual({
      input: { title: "Hello" },
      actor: sessionOrgActor,
    });
  });

  it("is BAD_REQUEST when nothing names an Organization", async () => {
    const caller = createOrganizationCaller(createMemberships({}))(createRequestContext());

    await expect(caller.run({ title: "Hello" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is NOT_FOUND without a live Membership for the named Organization", async () => {
    const caller = createOrganizationCaller(
      createMemberships({ "org-3": { id: "member-3", role: "member", userId: null } })
    )(createRequestContext());

    await expect(caller.run({ title: "Hello", organizationId: "org-2" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.run({ title: "Hello", organizationId: "org-3" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is UNAUTHORIZED without a User", async () => {
    const caller = createOrganizationCaller(createMemberships({}))({
      user: null,
      session: null,
      actor: null,
    });

    await expect(caller.run({ title: "Hello", organizationId: "org-2" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("strips organizationId before record-shaped domain input", async () => {
    const caller = createOrganizationCaller(
      createMemberships({ "org-2": { id: "member-2", role: "admin" } })
    )(createRequestContext());

    await expect(caller.patch({ theme: "dark", organizationId: "org-2" })).resolves.toEqual({
      theme: "dark",
    });
  });

  it("stamps ActorScope on Procedure meta", () => {
    const {
      privateProcedure,
      userProcedure,
      organizationProcedure,
      adminProcedure,
      publicProcedure,
    } = createTRPCMethods();
    const meta = (procedure: { query: (resolver: () => null) => unknown }) =>
      (procedure.query(() => null) as { _def: { meta?: unknown } })._def.meta;

    expect(meta(privateProcedure)).toEqual({ actorScope: "user" });
    expect(meta(userProcedure)).toEqual({ actorScope: "user" });
    expect(meta(organizationProcedure)).toEqual({ actorScope: "organization" });
    expect(meta(adminProcedure)).toEqual({ actorScope: "admin" });
    expect(meta(publicProcedure)).toBeUndefined();
  });

  it("merges meta.mcp onto the stamped ActorScope", () => {
    const { organizationProcedure } = createTRPCMethods();
    const procedure = organizationProcedure
      .input(z.object({ title: z.string() }))
      .meta({ mcp: { name: "announce", description: "Announce something" } })
      .query(() => null) as unknown as { _def: { meta?: unknown } };

    expect(procedure._def.meta).toEqual({
      actorScope: "organization",
      mcp: { name: "announce", description: "Announce something" },
    });
  });

  it("runs userProcedure for a cookieless User without selecting an Organization", async () => {
    const { router, userProcedure, createCallerFactory } = createTRPCMethods();
    const appRouter = router({
      whoami: userProcedure.query(({ ctx, input }) => ({ actor: ctx.actor, input })),
    });
    const caller = createCallerFactory(appRouter)({
      user: createUser(),
      session: null,
      actor: null,
    });

    await expect(caller.whoami({ organizationId: "org-9" })).resolves.toEqual({
      actor: {
        userId: "user-1",
        userRole: "member",
        organizationId: null,
        organizationRole: null,
        memberId: null,
        teamId: null,
        teamRole: null,
      },
      input: undefined,
    });
  });

  it("rejects userProcedure without a User", async () => {
    const { router, userProcedure, createCallerFactory } = createTRPCMethods();
    const appRouter = router({
      whoami: userProcedure.query(({ ctx }) => ctx.actor),
    });
    const caller = createCallerFactory(appRouter)({ user: null, session: null, actor: null });

    await expect(caller.whoami()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("runs adminProcedure for a cookieless admin User", async () => {
    const { router, adminProcedure, createCallerFactory } = createTRPCMethods();
    const appRouter = router({
      status: adminProcedure.query(({ ctx }) => ctx.actor),
    });
    const caller = createCallerFactory(appRouter)({
      user: createUser({ role: "admin" }),
      session: null,
      actor: null,
    });

    await expect(caller.status()).resolves.toEqual({
      userId: "user-1",
      userRole: "admin",
      organizationId: null,
      organizationRole: null,
      memberId: null,
      teamId: null,
      teamRole: null,
    });
  });

  it("rejects adminProcedure for a cookieless non-admin User", async () => {
    const { router, adminProcedure, createCallerFactory } = createTRPCMethods();
    const appRouter = router({
      status: adminProcedure.query(({ ctx }) => ctx.actor),
    });
    const caller = createCallerFactory(appRouter)({
      user: createUser({ role: "member" }),
      session: null,
      actor: null,
    });

    await expect(caller.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("builds OrganizationActor from a live Membership for a cookieless User", async () => {
    const caller = createOrganizationCaller(
      createMemberships({ "org-2": { id: "member-2", role: "admin" } })
    )({ user: createUser(), session: null, actor: null });

    await expect(caller.run({ title: "Hello", organizationId: "org-2" })).resolves.toEqual({
      input: { title: "Hello" },
      actor: {
        userId: "user-1",
        userRole: "member",
        organizationId: "org-2",
        organizationRole: "admin",
        memberId: "member-2",
        teamId: null,
        teamRole: null,
      },
    });
  });
});

describe("trpc auth helpers", () => {
  it("stores a user-scoped actor on the request context while copying session ids", async () => {
    const user = createUser();
    const session = createSession({
      activeOrganizationId: "org-1",
      activeOrganizationRole: "owner",
      activeOrganizationMemberId: "member-1",
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
      memberId: "member-1",
      teamId: null,
      teamRole: null,
    });
    expect(ctx.req).toEqual({ headers: {} });
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
          memberId: null,
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
              memberId: null,
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
        memberId: "member-1",
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
