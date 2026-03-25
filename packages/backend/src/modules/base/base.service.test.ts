import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import { err, ok } from "neverthrow";
import { ServerError } from "../../utils/errors";
import type { Context, Session, User } from "../auth/auth.lib";
import type { ResourceGrant } from "./base.grants";
import { BasePermissionService, BaseService } from "./base.service";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    role: "member",
    email: "user@example.com",
    name: "User",
    createdAt: new Date(),
    updatedAt: new Date(),
    banned: false,
    banReason: null,
    banExpires: null,
    emailVerified: true,
    image: null,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    token: "token",
    ipAddress: null,
    userAgent: null,
    userId: "user-1",
    activeOrganizationId: null,
    activeOrganizationRole: null,
    activeTeamId: null,
    activeTeamRole: null,
    impersonatedBy: null,
    ...overrides,
  } as Session;
}

describe("BaseService procedure builder", () => {
  it("runs chained steps in order and exposes state by step name", async () => {
    const events: string[] = [];

    class PipelineService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<{ value: string }>("run")
        .use("trimmed", ({ input }) => {
          events.push("trimmed");
          return input.value.trim();
        })
        .use("upper", ({ state }) => {
          events.push("upper");
          return state.trimmed.toUpperCase();
        })
        .handle(({ state }) => {
          events.push("handler");
          return ok({
            trimmed: state.trimmed,
            upper: state.upper,
          });
        });
    }

    const service = new PipelineService();
    const result = await service.run({ value: "  hello  " }, {});

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        trimmed: "hello",
        upper: "HELLO",
      });
    }
    expect(events).toEqual(["trimmed", "upper", "handler"]);
  });

  it("addContextFilter wraps auth and maps query input with the default step name", async () => {
    type QueryWithSearch = QueryInput & { search?: string };

    class QueryService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<QueryWithSearch>("run")
        .addContextFilter(["user", "organization"])
        .handle(({ input, state }) =>
          ok({
            input,
            stateMatches: state.contextFilter === input,
          })
        );
    }

    const service = new QueryService();

    const unauthorized = await service.run({ search: "hello" }, {} as never);
    expect(unauthorized.isErr()).toBe(true);
    if (unauthorized.isErr()) {
      expect(unauthorized.error.code).toBe("UNAUTHORIZED");
    }

    const authorized = await service.run(
      { search: "hello" },
      {
        user: createUser(),
        session: createSession({
          activeOrganizationId: "org-1",
        }),
      }
    );

    expect(authorized.isOk()).toBe(true);
    if (authorized.isOk()) {
      expect(authorized.value.input.search).toBe("hello");
      expect(authorized.value.stateMatches).toBe(true);
      expect(authorized.value.input.filters).toEqual([
        {
          columnId: "userId",
          type: "string",
          method: "equals",
          value: "user-1",
        },
        {
          columnId: "organizationId",
          type: "string",
          method: "equals",
          value: "org-1",
        },
      ]);
    }
  });

  it("mapInput updates the input seen by later steps and the handler", async () => {
    type QueryWithSearch = QueryInput & { search?: string };

    class QueryService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<QueryWithSearch>("run")
        .requireAuth()
        .mapInput("scopedQuery", ({ input, ctx }) =>
          this.addContextFilter(ctx, { user: true, organization: true, team: true }, input, {
            userId: {
              columnId: "authorUserId",
              method: "equals",
            },
            organizationId: {
              columnId: "organizationId",
              method: "equals",
            },
            teamId: {
              columnId: "teamId",
              method: "equals",
            },
          })
        )
        .use("filterCount", ({ input }) => input.filters?.length ?? 0)
        .handle(({ input, state }) =>
          ok({
            input,
            filterCount: state.filterCount,
            scopedInputMatches: state.scopedQuery === input,
          })
        );
    }

    const service = new QueryService();
    const result = await service.run(
      { search: "hello" },
      {
        user: createUser(),
        session: createSession({
          activeOrganizationId: "org-1",
          activeTeamId: "team-1",
        }),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.input.search).toBe("hello");
      expect(result.value.filterCount).toBe(3);
      expect(result.value.scopedInputMatches).toBe(true);
      expect(result.value.input.filters).toEqual([
        {
          columnId: "authorUserId",
          type: "string",
          method: "equals",
          value: "user-1",
        },
        {
          columnId: "organizationId",
          type: "string",
          method: "equals",
          value: "org-1",
        },
        {
          columnId: "teamId",
          type: "string",
          method: "equals",
          value: "team-1",
        },
      ]);
    }
  });

  it("uses the base service default context type for procedures", async () => {
    type RequestContext = Context & { requestId: string };

    class ContextService extends BaseService<
      Record<string, never>,
      Record<string, never>,
      RequestContext
    > {
      readonly run = this.procedure<{ value: string }>("run")
        .requireAuth()
        .handle(({ input, ctx }) => ok(`${ctx.requestId}:${ctx.user.id}:${input.value}`));
    }

    const service = new ContextService();
    const result = await service.run(
      { value: "ok" },
      {
        requestId: "req-1",
        user: createUser(),
        session: createSession(),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("req-1:user-1:ok");
    }
  });

  it("requireAuth rejects missing auth context", async () => {
    class ProtectedService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<{ value: string }>("run")
        .requireAuth()
        .handle(({ input, ctx }) => ok(`${ctx.user.id}:${input.value}`));
    }

    const service = new ProtectedService();
    const result = await service.run({ value: "x" }, {} as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("requireAuth allows valid context", async () => {
    class ProtectedService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<{ value: string }>("run")
        .requireAuth()
        .handle(({ input, ctx }) => ok(`${ctx.user.id}:${input.value}`));
    }

    const service = new ProtectedService();
    const result = await service.run(
      { value: "ok" },
      { user: createUser(), session: createSession() }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user-1:ok");
    }
  });

  it("normalizes thrown async errors through throwableAsync", async () => {
    class ThrowingService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure("run").handle(async () => {
        throw new Error("boom");
      });
    }

    const service = new ThrowingService();
    const result = await service.run(undefined, {});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it("logs metadata stages without input or context payloads", async () => {
    class LoggedService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<{ secret: string }>("run")
        .requireAuth()
        .handle(({ ctx }) => ok(ctx.user.id));
    }

    const service = new LoggedService();
    const debugSpy = jest.fn();
    service.logger.debug = debugSpy as typeof service.logger.debug;

    const result = await service.run(
      { secret: "top-secret" },
      {
        user: createUser(),
        session: createSession(),
        token: "super-token",
      }
    );

    expect(result.isOk()).toBe(true);
    expect(debugSpy).toHaveBeenCalledTimes(3);

    const payloads = debugSpy.mock.calls.map(([payload]) => payload);
    expect(payloads.map((payload) => payload.stage)).toEqual(["start", "auth_passed", "success"]);

    const serializedPayloads = JSON.stringify(payloads);
    expect(serializedPayloads).not.toContain("top-secret");
    expect(serializedPayloads).not.toContain("super-token");
    expect(payloads.every((payload) => !("input" in payload))).toBe(true);
    expect(payloads.every((payload) => !("ctx" in payload))).toBe(true);
  });
});

describe("BasePermissionService procedure builder", () => {
  it("passes loaded entities into the handler when access is granted", async () => {
    const grants: ResourceGrant[] = [
      {
        action: "read",
        level: "user",
        role: "member",
        access: "own",
      },
    ];

    class PermissionService extends BasePermissionService<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super({} as Record<string, never>, {} as Record<string, never>, grants);
      }

      readonly run = this.procedure<{ ownerId: string }>("run")
        .access({
          action: "read",
          entities: ({ input }) => ({
            userId: input.ownerId,
          }),
        })
        .handle(({ state }) => ok(state.access?.userId ?? null));
    }

    const service = new PermissionService();
    const result = await service.run(
      { ownerId: "user-1" },
      { user: createUser(), session: createSession() }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user-1");
    }
  });

  it("reuses a typed state step directly when entityStep is provided", async () => {
    const grants: ResourceGrant[] = [
      {
        action: "read",
        level: "user",
        role: "member",
        access: "own",
      },
    ];

    class PermissionService extends BasePermissionService<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super({} as Record<string, never>, {} as Record<string, never>, grants);
      }

      readonly run = this.procedure<{ ownerId: string }>("run")
        .use("record", ({ input }) =>
          ok({
            id: "resource-1",
            userId: input.ownerId,
            teamId: null,
            organizationId: null,
          })
        )
        .access({
          action: "read",
          entityStep: "record",
        })
        .handle(({ state }) => ok(state.access === state.record));
    }

    const service = new PermissionService();
    const result = await service.run(
      { ownerId: "user-1" },
      { user: createUser(), session: createSession() }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(true);
    }
  });

  it("returns FORBIDDEN when access validation fails", async () => {
    const grants: ResourceGrant[] = [
      {
        action: "read",
        level: "user",
        role: "member",
        access: "own",
      },
    ];

    class PermissionService extends BasePermissionService<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super({} as Record<string, never>, {} as Record<string, never>, grants);
      }

      readonly run = this.procedure<{ ownerId: string }>("run")
        .access({
          action: "read",
          entities: ({ input }) => ({
            userId: input.ownerId,
          }),
        })
        .handle(() => ok("allowed"));
    }

    const service = new PermissionService();
    const result = await service.run(
      { ownerId: "other-user" },
      { user: createUser(), session: createSession() }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("propagates entity loader failures through access", async () => {
    const grants: ResourceGrant[] = [
      {
        action: "read",
        level: "user",
        role: "member",
        access: "own",
      },
    ];

    class PermissionService extends BasePermissionService<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super({} as Record<string, never>, {} as Record<string, never>, grants);
      }

      readonly run = this.procedure<{ ownerId: string }>("run")
        .access({
          action: "read",
          entities: async () =>
            err(
              new ServerError({
                code: "NOT_FOUND",
                layer: "service",
                layerName: "PermissionService",
                message: "Missing entity",
              })
            ),
        })
        .handle(() => ok("allowed"));
    }

    const service = new PermissionService();
    const result = await service.run(
      { ownerId: "user-1" },
      { user: createUser(), session: createSession() }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
    }
  });

  it("skips entity loading when grants already allow all access", async () => {
    const grants: ResourceGrant[] = [
      {
        action: "read",
        level: "user",
        role: "member",
        access: "all",
      },
    ];
    const resolveEntity = jest.fn(async () => ({ userId: "user-1" }));

    class PermissionService extends BasePermissionService<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super({} as Record<string, never>, {} as Record<string, never>, grants);
      }

      readonly run = this.procedure<{ ownerId: string }>("run")
        .access({
          action: "read",
          entities: resolveEntity,
        })
        .handle(() => ok("allowed"));
    }

    const service = new PermissionService();
    const result = await service.run(
      { ownerId: "other-user" },
      { user: createUser(), session: createSession() }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("allowed");
    }
    expect(resolveEntity).not.toHaveBeenCalled();
  });
});
