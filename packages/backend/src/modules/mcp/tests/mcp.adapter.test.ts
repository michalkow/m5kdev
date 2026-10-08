import type { Client } from "@libsql/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCMethods } from "../../../utils/trpc";
import type { AuthOrganizationRepository } from "../../auth/auth.repository";
import { collectMcpTools, createMcpToolInvoker } from "../mcp.adapter";
import type { McpService } from "../mcp.service";
import { createMcpTRPC } from "../mcp.trpc";
import { LIST_ORGANIZATIONS_MCP_CALL } from "../mcp.types";
import {
  createMcpMemoryClient,
  createMcpService,
  createMcpTables,
  MCP_CLIENT_CLAUDE,
  MCP_CLIENT_CURSOR,
  MCP_ORG_A,
  MCP_ORG_B,
  MCP_USER_ID,
  seedMcpFixture,
} from "./mcp.fixtures";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  fromNodeHeaders: (headers: unknown) => headers,
}));

function buildCatalogRouter() {
  const methods = createTRPCMethods();
  const router = methods.router({
    posts: methods.router({
      list: methods.organizationProcedure
        .meta({ mcp: { name: "list-posts", description: "List posts in an Organization" } })
        .input(z.object({ q: z.string().optional() }))
        .query(({ ctx }) => ctx.actor.organizationId),
      update: methods.organizationProcedure
        .input(z.object({ id: z.string() }))
        .mutation(() => "updated"),
    }),
    admin: methods.router({
      status: methods.adminProcedure
        .meta({ mcp: { name: "status", description: "Read service status" } })
        .query(({ ctx }) => ctx.actor.userRole),
    }),
  });
  return { router, methods };
}

describe("collectMcpTools", () => {
  it("collects meta.mcp procedures with flat names, ActorScope, and tRPC paths", () => {
    const { router } = buildCatalogRouter();
    const tools = collectMcpTools(router);
    expect(tools.map((tool) => tool.name).sort()).toEqual(["list-posts", "status"]);
    const listPosts = tools.find((tool) => tool.name === "list-posts");
    expect(listPosts).toMatchObject({
      description: "List posts in an Organization",
      actorScope: "organization",
      trpcPath: "posts.list",
      requiresOrganizationId: true,
    });
    const status = tools.find((tool) => tool.name === "status");
    expect(status).toMatchObject({ actorScope: "admin", trpcPath: "admin.status" });
  });

  it("requires organizationId on org tool input schemas and not on admin ones", () => {
    const { router } = buildCatalogRouter();
    const tools = new Map(collectMcpTools(router).map((tool) => [tool.name, tool]));
    const orgInput = tools.get("list-posts")?.inputSchema;
    expect(orgInput?.safeParse({}).success).toBe(false);
    expect(orgInput?.safeParse({ organizationId: "org-a", q: "hi" }).success).toBe(true);
    expect(tools.get("status")?.requiresOrganizationId).toBe(false);
  });

  it("fails when two procedures share a flat tool name", () => {
    const methods = createTRPCMethods();
    const router = methods.router({
      first: methods.router({
        ping: methods.userProcedure
          .meta({ mcp: { name: "ping", description: "First" } })
          .query(() => "first"),
      }),
      second: methods.router({
        ping: methods.userProcedure
          .meta({ mcp: { name: "ping", description: "Second" } })
          .query(() => "second"),
      }),
    });
    expect(() => collectMcpTools(router)).toThrow('Duplicate MCP tool name "ping"');
  });

  it("fails when meta.mcp has no name, no description, or no ActorScope", () => {
    const methods = createTRPCMethods();
    const unnamed = methods.router({
      broken: methods.userProcedure
        .meta({ mcp: { name: "", description: "Missing name" } })
        .query(() => null),
    });
    expect(() => collectMcpTools(unnamed)).toThrow(/requires a non-empty mcp.name/);
    const undescribed = methods.router({
      broken: methods.userProcedure
        .meta({ mcp: { name: "broken", description: "" } })
        .query(() => null),
    });
    expect(() => collectMcpTools(undescribed)).toThrow(/requires a non-empty mcp.description/);
    const unscoped = methods.router({
      broken: methods.publicProcedure
        .meta({ mcp: { name: "broken", description: "No scope" } })
        .query(() => null),
    });
    expect(() => collectMcpTools(unscoped)).toThrow(/actorScope/);
  });
});

describe("createMcpToolInvoker", () => {
  let client: Client;
  let mcp: McpService;
  let organizations: AuthOrganizationRepository;

  function buildInvoker() {
    const methods = createTRPCMethods({ memberships: organizations });
    const appRouter = methods.router({
      mcp: createMcpTRPC(methods, mcp),
      posts: methods.router({
        list: methods.organizationProcedure
          .meta({ mcp: { name: "list-posts", description: "List posts in an Organization" } })
          .input(z.object({ q: z.string().optional() }))
          .output(z.object({ organizationId: z.string() }))
          .query(({ ctx }) => ({ organizationId: ctx.actor.organizationId })),
        guarded: methods.organizationProcedure
          .meta({ mcp: { name: "guarded", description: "Owner-only posts" } })
          .input(z.object({}))
          .query(({ ctx }) => {
            if (ctx.actor.organizationRole !== "owner") {
              throw new TRPCError({ code: "FORBIDDEN", message: "Owners only" });
            }
            return ctx.actor.organizationId;
          }),
      }),
      admin: methods.router({
        ping: methods.adminProcedure
          .meta({ mcp: { name: "admin-ping", description: "Admin ping" } })
          .input(z.object({}))
          .query(({ ctx }) => ctx.actor.userRole),
      }),
    });
    return createMcpToolInvoker({ router: appRouter, methods, mcp });
  }

  beforeEach(async () => {
    client = createMcpMemoryClient();
    await createMcpTables(client);
    await seedMcpFixture(client);
    const services = createMcpService(client);
    mcp = services.mcp;
    organizations = services.organizations;
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_A],
    });
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("invokes an org-scoped procedure in-process with the OAuth User", async () => {
    const invoke = buildInvoker();
    const result = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "list-posts",
      arguments: { organizationId: MCP_ORG_A, q: "hi" },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ organizationId: MCP_ORG_A });
    }
  });

  it("requires organizationId on org-scoped tools", async () => {
    const invoke = buildInvoker();
    const result = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "list-posts",
      arguments: { q: "hi" },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
  });

  it("keeps allowlist miss distinct from Membership miss", async () => {
    const invoke = buildInvoker();
    const allowlistMiss = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "list-posts",
      arguments: { organizationId: MCP_ORG_B },
    });
    expect(allowlistMiss.isErr()).toBe(true);
    if (allowlistMiss.isErr()) {
      expect(allowlistMiss.error.code).toBe("FORBIDDEN");
      expect(allowlistMiss.error.context?.reason).toBe("allowlist");
    }

    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: "admin-1",
      organizationIds: [MCP_ORG_B],
    });
    const noMembership = await invoke({
      userId: "admin-1",
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "list-posts",
      arguments: { organizationId: MCP_ORG_B },
    });
    expect(noMembership.isErr()).toBe(true);
    if (noMembership.isErr()) {
      expect(noMembership.error.code).toBe("NOT_FOUND");
    }
  });

  it("fails org tools on an empty allowlist while list-organizations returns none", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [],
    });
    const invoke = buildInvoker();
    const orgResult = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "list-posts",
      arguments: { organizationId: MCP_ORG_A },
    });
    expect(orgResult.isErr()).toBe(true);
    if (orgResult.isErr()) {
      expect(orgResult.error.code).toBe("FORBIDDEN");
    }
    const listed = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: LIST_ORGANIZATIONS_MCP_CALL,
      arguments: {},
    });
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toEqual([]);
    }
  });

  it("serves list-organizations per OAuth client without organizationId", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CLAUDE,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_B],
    });
    const invoke = buildInvoker();
    const cursorList = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: LIST_ORGANIZATIONS_MCP_CALL,
      arguments: {},
    });
    expect(cursorList.isOk()).toBe(true);
    if (cursorList.isOk()) {
      expect(cursorList.value).toEqual([
        { id: MCP_ORG_A, name: "Acme", organizationRole: "owner" },
      ]);
    }
  });

  it("propagates Grant denials from the procedure", async () => {
    const invoke = buildInvoker();
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_A, MCP_ORG_B],
    });
    const denied = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "guarded",
      arguments: { organizationId: MCP_ORG_B },
    });
    expect(denied.isErr()).toBe(true);
    if (denied.isErr()) {
      expect(denied.error.code).toBe("FORBIDDEN");
    }
    const allowed = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "guarded",
      arguments: { organizationId: MCP_ORG_A },
    });
    expect(allowed.isOk()).toBe(true);
  });

  it("runs admin tools as AdminActor without allowlist or organizationId", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: "admin-1",
      organizationIds: [],
    });
    const invoke = buildInvoker();
    const allowed = await invoke({
      userId: "admin-1",
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "admin-ping",
      arguments: {},
    });
    expect(allowed.isOk()).toBe(true);
    if (allowed.isOk()) {
      expect(allowed.value).toBe("admin");
    }
    const denied = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "admin-ping",
      arguments: {},
    });
    expect(denied.isErr()).toBe(true);
    if (denied.isErr()) {
      expect(denied.error.code).toBe("FORBIDDEN");
    }
  });

  it("returns NOT_FOUND for unknown tool names", async () => {
    const invoke = buildInvoker();
    const result = await invoke({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      name: "missing",
      arguments: {},
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });
});
