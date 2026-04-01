import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import { err, ok } from "neverthrow";
import { ServerError } from "../../utils/errors";
import type { ServiceActorClaims, ServiceOrganizationActor, ServiceTeamActor } from "./base.actor";
import { createServiceActor } from "./base.actor";
import type { ResourceGrant } from "./base.grants";
import { BasePermissionService, BaseService } from "./base.service";

function createActor(overrides: Partial<ServiceActorClaims> = {}) {
  const actor = createServiceActor({
    userId: "user-1",
    userRole: "member",
    organizationId: null,
    organizationRole: null,
    teamId: null,
    teamRole: null,
    ...overrides,
  });

  if (!actor) {
    throw new Error("Expected actor");
  }

  return actor;
}

function createOrganizationActor(
  overrides: Partial<ServiceActorClaims> = {}
): ServiceOrganizationActor {
  return createActor({
    organizationId: "org-1",
    organizationRole: "owner",
    ...overrides,
  }) as ServiceOrganizationActor;
}

function createTeamActor(overrides: Partial<ServiceActorClaims> = {}): ServiceTeamActor {
  return createActor({
    organizationId: "org-1",
    organizationRole: "owner",
    teamId: "team-1",
    teamRole: "member",
    ...overrides,
  }) as ServiceTeamActor;
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

  it("loadResource propagates Err, maps missing values to NOT_FOUND, and narrows state", async () => {
    class ResourceService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly okRun = this.procedure<{ id: string }>("okRun")
        .loadResource("row", ({ input }) =>
          input.id === "1" ? ok({ id: "1", name: "a" }) : ok(undefined)
        )
        .handle(({ state }) => ok({ id: state.row.id, name: state.row.name }));

      readonly errRun = this.procedure<{ id: string }>("errRun")
        .loadResource("row", () =>
          err(
            new ServerError({
              code: "INTERNAL_SERVER_ERROR",
              layer: "service",
              layerName: "ResourceService",
              message: "db",
            })
          )
        )
        .handle(() => ok("skip"));

      readonly customMsg = this.procedure<{ id: string }>("customMsg")
        .loadResource("row", () => ok(undefined), { notFoundMessage: "Doc missing" })
        .handle(() => ok("skip"));
    }

    const service = new ResourceService();

    const success = await service.okRun({ id: "1" }, {});
    expect(success.isOk()).toBe(true);
    if (success.isOk()) {
      expect(success.value).toEqual({ id: "1", name: "a" });
    }

    const missing = await service.okRun({ id: "2" }, {});
    expect(missing.isErr()).toBe(true);
    if (missing.isErr()) {
      expect(missing.error.code).toBe("NOT_FOUND");
      expect(missing.error.message).toBe("Resource not found");
    }

    const failed = await service.errRun({ id: "1" }, {});
    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) {
      expect(failed.error.code).toBe("INTERNAL_SERVER_ERROR");
    }

    const custom = await service.customMsg({ id: "x" }, {});
    expect(custom.isErr()).toBe(true);
    if (custom.isErr()) {
      expect(custom.error.message).toBe("Doc missing");
    }
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
        actor: createOrganizationActor(),
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

  it("addContextFilter returns FORBIDDEN when the actor scope is too small", async () => {
    type QueryWithSearch = QueryInput & { search?: string };

    class QueryService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<QueryWithSearch>("run")
        .addContextFilter(["organization"])
        .handle(({ input }) => ok(input));
    }

    const service = new QueryService();
    const result = await service.run({ search: "hello" }, {
      actor: createActor(),
    } as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("mapInput updates the input seen by later steps and the handler", async () => {
    type QueryWithSearch = QueryInput & { search?: string };

    class QueryService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure<QueryWithSearch>("run")
        .requireAuth()
        .mapInput("scopedQuery", ({ input, ctx }) =>
          this.addContextFilter(ctx.actor, { user: true, organization: true, team: true }, input, {
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
        actor: createTeamActor(),
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
    type RequestContext = { actor: ReturnType<typeof createActor>; requestId: string };

    class ContextService extends BaseService<
      Record<string, never>,
      Record<string, never>,
      RequestContext
    > {
      readonly run = this.procedure<{ value: string }>("run")
        .requireAuth()
        .handle(({ input, ctx }) => ok(`${ctx.requestId}:${ctx.actor.userId}:${input.value}`));
    }

    const service = new ContextService();
    const result = await service.run(
      { value: "ok" },
      {
        requestId: "req-1",
        actor: createActor(),
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
        .handle(({ input, ctx }) => ok(`${ctx.actor.userId}:${input.value}`));
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
        .handle(({ input, ctx }) => ok(`${ctx.actor.userId}:${input.value}`));
    }

    const service = new ProtectedService();
    const result = await service.run({ value: "ok" }, { actor: createActor() });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user-1:ok");
    }
  });

  it("requireAuth accepts organization actors for organization scope", async () => {
    class ProtectedService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure("run")
        .requireAuth("organization")
        .handle(({ ctx }) => ok(ctx.actor.organizationId));
    }

    const service = new ProtectedService();
    const result = await service.run(undefined, {
      actor: createOrganizationActor(),
    } as never);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("org-1");
    }
  });

  it("requireAuth rejects actors without the requested team scope", async () => {
    class ProtectedService extends BaseService<Record<string, never>, Record<string, never>> {
      readonly run = this.procedure("run")
        .requireAuth("team")
        .handle(({ ctx }) => ok(ctx.actor.teamId));
    }

    const service = new ProtectedService();
    const result = await service.run(undefined, {
      actor: createOrganizationActor(),
    } as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FORBIDDEN");
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
        .handle(({ ctx }) => ok(ctx.actor.userId));
    }

    const service = new LoggedService();
    const debugSpy = jest.fn();
    service.logger.debug = debugSpy as typeof service.logger.debug;

    const result = await service.run(
      { secret: "top-secret" },
      {
        actor: createActor(),
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
    expect(payloads.every((payload) => "hasActor" in payload)).toBe(true);
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
    const result = await service.run({ ownerId: "user-1" }, { actor: createActor() });

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
    const result = await service.run({ ownerId: "user-1" }, { actor: createActor() });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(true);
    }
  });

  it("loadResource works before access with entityStep", async () => {
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
        .loadResource("record", ({ input }) =>
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
        .handle(({ state }) => ok(state.record.id === "resource-1"));
    }

    const service = new PermissionService();
    const result = await service.run({ ownerId: "user-1" }, { actor: createActor() });

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
    const result = await service.run({ ownerId: "other-user" }, { actor: createActor() });

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
    const result = await service.run({ ownerId: "user-1" }, { actor: createActor() });

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
    const result = await service.run({ ownerId: "other-user" }, { actor: createActor() });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("allowed");
    }
    expect(resolveEntity).not.toHaveBeenCalled();
  });
});
