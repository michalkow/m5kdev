import type { Client } from "@libsql/client";
import type { McpService } from "../mcp.service";
import {
  createMcpMemoryClient,
  createMcpService,
  createMcpTables,
  MCP_CLIENT_CLAUDE,
  MCP_CLIENT_CURSOR,
  MCP_ORG_A,
  MCP_ORG_B,
  MCP_ORG_C,
  MCP_USER_ID,
  seedMcpFixture,
} from "./mcp.fixtures";

describe("McpService allowlist and consent", () => {
  let client: Client;
  let mcp: McpService;

  beforeEach(async () => {
    client = createMcpMemoryClient();
    await createMcpTables(client);
    await seedMcpFixture(client);
    mcp = createMcpService(client).mcp;
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("lists only allowlisted Organizations with live Membership for that OAuth client", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_A, MCP_ORG_C],
    });
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CLAUDE,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_B],
    });
    const cursorList = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
    });
    expect(cursorList.isOk()).toBe(true);
    if (cursorList.isOk()) {
      expect(cursorList.value).toEqual([
        { id: MCP_ORG_A, name: "Acme", organizationRole: "owner" },
      ]);
    }
    const claudeList = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CLAUDE,
    });
    expect(claudeList.isOk()).toBe(true);
    if (claudeList.isOk()) {
      expect(claudeList.value).toEqual([
        { id: MCP_ORG_B, name: "Beta", organizationRole: "member" },
      ]);
    }
  });

  it("returns none for list-organizations when the allowlist is empty", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [],
    });
    const listed = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
    });
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toEqual([]);
    }
  });

  it("does not treat an invited or soft-deleted Membership as allowlisted", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_C],
    });
    const listed = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
    });
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toEqual([]);
    }
  });

  it("lists consent Organizations as live Memberships only and marks the current allowlist", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_A, MCP_ORG_C],
    });
    const listed = await mcp.listConsentOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
    });
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toEqual([
        { id: MCP_ORG_A, name: "Acme", allowlisted: true },
        { id: MCP_ORG_B, name: "Beta", allowlisted: false },
      ]);
    }
  });

  it("replaces a consent allowlist with live Memberships only, including empty", async () => {
    await mcp.replaceConsentAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_A, MCP_ORG_C],
    });
    await mcp.replaceConsentAllowlist({
      oauthClientId: MCP_CLIENT_CLAUDE,
      userId: MCP_USER_ID,
      organizationIds: [MCP_ORG_B],
    });
    const cursorList = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
    });
    expect(cursorList.isOk()).toBe(true);
    if (cursorList.isOk()) {
      expect(cursorList.value).toEqual([
        { id: MCP_ORG_A, name: "Acme", organizationRole: "owner" },
      ]);
    }

    await mcp.replaceConsentAllowlist({
      oauthClientId: MCP_CLIENT_CURSOR,
      userId: MCP_USER_ID,
      organizationIds: [],
    });
    const emptyList = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CURSOR,
    });
    expect(emptyList.isOk()).toBe(true);
    if (emptyList.isOk()) {
      expect(emptyList.value).toEqual([]);
    }
    const claudeList = await mcp.listOrganizations({
      userId: MCP_USER_ID,
      oauthClientId: MCP_CLIENT_CLAUDE,
    });
    expect(claudeList.isOk()).toBe(true);
    if (claudeList.isOk()) {
      expect(claudeList.value).toEqual([
        { id: MCP_ORG_B, name: "Beta", organizationRole: "member" },
      ]);
    }
  });
});
