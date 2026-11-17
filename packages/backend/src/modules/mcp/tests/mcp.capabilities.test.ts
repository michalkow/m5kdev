import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import { err, ok } from "neverthrow";
import type { Pool } from "pg";
import { ServerError } from "../../../utils/errors";
import { createTRPCMethods, type RequireEntitlements } from "../../../utils/trpc";
import * as authTables from "../../auth/auth.db";
import { collectMcpTools, createMcpToolInvoker } from "../mcp.adapter";
import { createMcpExpressHandler } from "../mcp.http";
import {
  createMcpService,
  createMcpTables,
  createMcpTestPool,
  MCP_CLIENT_CLAUDE,
  MCP_CLIENT_CURSOR,
  MCP_ORG_A,
  MCP_ORG_B,
  MCP_USER_ID,
  seedMcpFixture,
} from "./mcp.fixtures";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({ fromNodeHeaders: (headers: unknown) => headers }));
jest.mock("@better-auth/mcp", () => ({
  createMcpProtectedRequestHandler:
    (_options: unknown, handler: (request: Request, jwt: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, {
        sub: MCP_USER_ID,
        client_id: request.headers.get("authorization")?.replace("Bearer ", ""),
      }),
}));

describe("Capability-aware MCP HTTP", () => {
  let client: Pool;
  let server: Server;
  let url: string;
  let capabilities: Record<string, string[]>;
  let checkerFailure: ServerError | undefined;
  let published: string[];
  let mcp: ReturnType<typeof createMcpService>["mcp"];

  beforeEach(async () => {
    client = createMcpTestPool();
    await createMcpTables(client);
    await seedMcpFixture(client);
    const services = createMcpService(client);
    mcp = services.mcp;
    await mcp.replaceAllowlist({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      organizationIds: [MCP_ORG_A, MCP_ORG_B],
    });
    capabilities = { [MCP_ORG_A]: ["posts.read"], [MCP_ORG_B]: ["posts.publish"] };
    checkerFailure = undefined;
    published = [];
    const requireEntitlements: RequireEntitlements = async (actor, required) => {
      if (checkerFailure) return err(checkerFailure);
      const missing = required.filter((key) => !capabilities[actor.organizationId]?.includes(key));
      return missing.length
        ? err(
            new ServerError({
              code: "FORBIDDEN",
              message: "Entitlement denied",
              context: { kind: "entitlement", capabilities: missing, reason: "missing_capability" },
            })
          )
        : ok(true);
    };
    const methods = createTRPCMethods({ memberships: services.organizations, requireEntitlements });
    const router = methods.router({
      ping: methods.userProcedure
        .meta({ mcp: { name: "ping", description: "Ping" } })
        .query(() => "pong"),
      read: methods.organizationProcedure
        .meta({ requiredCapabilities: ["posts.read"], mcp: { name: "read", description: "Read" } })
        .query(() => "read"),
      publish: methods.organizationProcedure
        .meta({
          requiredCapabilities: ["posts.publish"],
          mcp: { name: "publish", description: "Publish" },
        })
        .mutation(({ ctx }) => {
          published.push(ctx.actor.organizationId);
          return "published";
        }),
      both: methods.organizationProcedure
        .meta({
          requiredCapabilities: ["posts.read", "posts.publish"],
          mcp: { name: "both", description: "Read and publish" },
        })
        .query(() => "both"),
    });
    const tools = collectMcpTools(router);
    const app = express();
    app.use(express.json());
    app.post(
      "/mcp",
      createMcpExpressHandler({
        auth: {
          options: {},
          $context: Promise.resolve({
            baseURL: "http://issuer.test/api/auth",
            internalAdapter: {},
          }),
        } as never,
        resource: "http://resource.test/mcp",
        serverName: "Capability test",
        tools,
        listTools: ({ userId, oauthClientId }) =>
          mcp.listAvailableTools({
            userId,
            oauthClientId,
            tools,
            requireEntitlements: methods.requireEntitlements,
          }),
        invoke: createMcpToolInvoker({ router, methods, mcp, tools }),
      })
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });

  afterEach(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    await client.end();
  });

  async function request(method: string, params: unknown = {}, oauthClientId = MCP_CLIENT_CURSOR) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${oauthClientId}`,
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await response.text();
    const data = body.startsWith("event:")
      ? body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6)
      : body;
    return JSON.parse(data ?? "null");
  }

  async function toolNames(oauthClientId = MCP_CLIENT_CURSOR): Promise<string[]> {
    const response = await request("tools/list", {}, oauthClientId);
    return response.result.tools.map((tool: { name: string }) => tool.name).sort();
  }

  it("lists the union of eligible Organizations without combining requirements across them", async () => {
    await expect(toolNames()).resolves.toEqual(["ping", "publish", "read"]);
    capabilities[MCP_ORG_B] = ["posts.read", "posts.publish"];
    await expect(toolNames()).resolves.toEqual(["both", "ping", "publish", "read"]);
  });

  it("uses only the current OAuth client's allowlist and refreshes consent changes", async () => {
    await expect(toolNames(MCP_CLIENT_CLAUDE)).resolves.toEqual(["ping"]);
    await expect(toolNames()).resolves.toEqual(["ping", "publish", "read"]);
    await mcp.replaceAllowlist({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      organizationIds: [],
    });
    await expect(toolNames()).resolves.toEqual(["ping"]);
  });

  it("does not use Closed Organizations or deleted/invited Memberships", async () => {
    const orm = drizzle(client, { schema: authTables });
    await orm
      .update(authTables.organizations)
      .set({ closedAt: new Date() })
      .where(eq(authTables.organizations.id, MCP_ORG_B));
    await expect(toolNames()).resolves.toEqual(["ping", "read"]);
    await orm
      .update(authTables.members)
      .set({ deletedAt: new Date() })
      .where(eq(authTables.members.id, "member-a"));
    await mcp.replaceAllowlist({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
      organizationIds: [MCP_ORG_A, MCP_ORG_B, "org-c"],
    });
    capabilities["org-c"] = ["posts.read", "posts.publish"];
    await expect(toolNames()).resolves.toEqual(["ping"]);
  });

  it("checks the call's target Organization and rejects a cached tool after revocation", async () => {
    await expect(toolNames()).resolves.toEqual(["ping", "publish", "read"]);
    const denied = await request("tools/call", {
      name: "publish",
      arguments: { organizationId: MCP_ORG_A },
    });
    expect(denied.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "Entitlement denied" }],
    });
    expect(published).toEqual([]);
    const allowed = await request("tools/call", {
      name: "publish",
      arguments: { organizationId: MCP_ORG_B },
    });
    expect(allowed.result.isError).not.toBe(true);
    expect(published).toEqual([MCP_ORG_B]);
    capabilities[MCP_ORG_B] = [];
    await expect(toolNames()).resolves.toEqual(["ping", "read"]);
    const cached = await request("tools/call", {
      name: "publish",
      arguments: { organizationId: MCP_ORG_B },
    });
    expect(cached.error).toMatchObject({ code: -32602 });
    expect(cached.result).toBeUndefined();
    expect(published).toEqual([MCP_ORG_B]);
  });

  it("propagates Billing errors instead of returning an allowed catalog", async () => {
    checkerFailure = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Billing unavailable",
    });
    const response = await request("tools/list");
    expect(response.error).toMatchObject({ code: -32603, message: "Internal server error" });
    expect(response.result).toBeUndefined();
  });

  it("keeps requirement-bearing tools available when Billing is omitted", async () => {
    const result = await mcp.listAvailableTools({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CLAUDE,
      tools: [{ name: "publish", requiredCapabilities: ["posts.publish"] }],
    });
    expect(result).toEqual(ok([{ name: "publish", requiredCapabilities: ["posts.publish"] }]));
  });
});
