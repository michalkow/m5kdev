import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { z } from "zod";
import * as authTables from "../../auth/auth.db";
import { AuthOrganizationRepository, AuthUserRepository } from "../../auth/auth.repository";
import { mcpAllowlistEntries } from "../mcp.db";
import { McpRepository } from "../mcp.repository";
import { McpService } from "../mcp.service";
import { LIST_ORGANIZATIONS_MCP_CALL } from "../mcp.types";

const USER_ID = "user-1";
const USER_ROLE = "user";
const ORG_A = "org-a";
const ORG_B = "org-b";
const ORG_C = "org-c";
const MEMBER_A = "member-a";
const MEMBER_B = "member-b";
const MEMBER_INVITED = "member-invited";
const MEMBER_DELETED = "member-deleted";
const CLIENT_CURSOR = "oauth-cursor";
const CLIENT_CLAUDE = "oauth-claude";

const schema = {
  ...authTables,
  mcpAllowlistEntries,
};

async function createTables(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT,
      banned INTEGER,
      ban_reason TEXT,
      ban_expires INTEGER,
      stripe_customer_id TEXT UNIQUE,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT DEFAULT '[]',
      locale TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      logo TEXT,
      type TEXT,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      onboarding INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      flags TEXT DEFAULT '[]',
      locale TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE members (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      user_id TEXT REFERENCES users(id),
      email TEXT,
      name TEXT NOT NULL DEFAULT '',
      image TEXT,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT DEFAULT '[]'
    );
  `);
  await client.execute(`
    CREATE TABLE invitations (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      member_id TEXT,
      email TEXT NOT NULL,
      role TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      inviter_id TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE mcp_allowlist_entries (
      id TEXT PRIMARY KEY NOT NULL,
      oauth_client_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      created_at INTEGER NOT NULL,
      UNIQUE (oauth_client_id, user_id, organization_id)
    );
  `);
}

function createService(client: Client): McpService {
  const orm = drizzle(client, { schema });
  const mcpRepository = new McpRepository({
    orm,
    schema: { mcpAllowlistEntries },
    table: mcpAllowlistEntries,
  });
  const organizationRepository = new AuthOrganizationRepository({
    orm,
    schema: authTables,
    table: authTables.organizations,
  });
  const userRepository = new AuthUserRepository({
    orm,
    schema: authTables,
    table: authTables.users,
  });
  return new McpService(mcpRepository, organizationRepository, userRepository);
}

async function seed(client: Client): Promise<void> {
  const orm = drizzle(client, { schema });
  await orm.insert(authTables.users).values({
    id: USER_ID,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    role: USER_ROLE,
  });
  await orm.insert(authTables.organizations).values([
    { id: ORG_A, name: "Acme", slug: "acme" },
    { id: ORG_B, name: "Beta", slug: "beta" },
    { id: ORG_C, name: "Closed", slug: "closed" },
  ]);
  await orm.insert(authTables.members).values([
    {
      id: MEMBER_A,
      organizationId: ORG_A,
      userId: USER_ID,
      name: "Ada",
      role: "owner",
    },
    {
      id: MEMBER_B,
      organizationId: ORG_B,
      userId: USER_ID,
      name: "Ada",
      role: "member",
    },
    {
      id: MEMBER_INVITED,
      organizationId: ORG_C,
      userId: null,
      name: "Invited",
      email: "invitee@example.com",
      role: "member",
    },
    {
      id: MEMBER_DELETED,
      organizationId: ORG_C,
      userId: USER_ID,
      name: "Ada",
      role: "member",
      deletedAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  ]);
}

describe("McpService", () => {
  let client: Client;
  let mcp: McpService;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await createTables(client);
    await seed(client);
    mcp = createService(client);
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("discovers MCP calls from two services and lists builtin list-organizations", () => {
    const posts = {
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title),
    };
    const tags = {
      echo: mcp
        .description("Echo")
        .input(z.object({ text: z.string() }))
        .handle(async (input: { text: string }) => input.text),
    };
    mcp.registerService(posts);
    mcp.registerService(tags);
    expect(mcp.listCatalog().map((entry) => entry.name)).toEqual([
      LIST_ORGANIZATIONS_MCP_CALL,
      "announce",
      "echo",
    ]);
  });

  it("rejects duplicate MCP call names", () => {
    const def = () =>
      mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title);
    mcp.registerService({ announce: def() });
    expect(() => mcp.registerService({ announce: def() })).toThrow(
      'already registered for MCP call "announce"'
    );
  });

  it("rejects an MCP call without handle", () => {
    const incomplete = mcp.description("Broken").input(z.object({}));
    expect(() => mcp.registerService({ broken: incomplete })).toThrow(/no \.handle\(\) attached/);
  });

  it("registers MCP calls next to Workflow job definitions on the same service", () => {
    const mixed = {
      demoPingJob: {
        jobName: "demo.ping",
        queueName: "fast",
        _config: {},
        _handler: async () => undefined,
      },
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title),
    };
    mcp.registerService(mixed);
    expect(mcp.listCatalog().map((entry) => entry.name)).toEqual([
      LIST_ORGANIZATIONS_MCP_CALL,
      "announce",
    ]);
  });

  it("strips organizationId and passes OrganizationActor with that Membership", async () => {
    let seen: { input: unknown; actor: unknown } | undefined;
    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input, actor) => {
          seen = { input, actor };
          return "ok";
        }),
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_A, ORG_B],
    });
    const result = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_A, title: "Hello" },
    });
    expect(result.isOk()).toBe(true);
    expect(seen?.input).toEqual({ title: "Hello" });
    expect(seen?.actor).toEqual({
      userId: USER_ID,
      userRole: USER_ROLE,
      organizationId: ORG_A,
      organizationRole: "owner",
      memberId: MEMBER_A,
      teamId: null,
      teamRole: null,
    });
  });

  it("fails when organizationId is missing", async () => {
    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title),
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_A],
    });
    const result = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { title: "Hello" },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
  });

  it("fails allowlist miss distinctly from Membership miss", async () => {
    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title),
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_A],
    });
    const allowlistMiss = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_B, title: "Hello" },
    });
    expect(allowlistMiss.isErr()).toBe(true);
    if (allowlistMiss.isErr()) {
      expect(allowlistMiss.error.code).toBe("FORBIDDEN");
      expect(allowlistMiss.error.context?.reason).toBe("allowlist");
    }

    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_C],
    });
    const membershipMiss = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_C, title: "Hello" },
    });
    expect(membershipMiss.isErr()).toBe(true);
    if (membershipMiss.isErr()) {
      expect(membershipMiss.error.code).toBe("NOT_FOUND");
      expect(membershipMiss.error.context?.reason).toBe("membership");
    }
  });

  it("does not run the handle when the MCP call name is unknown", async () => {
    const result = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "missing",
      arguments: { organizationId: ORG_A },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("does not run the handle when input fails Zod", async () => {
    let ran = false;
    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async () => {
          ran = true;
          return "ok";
        }),
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_A],
    });
    const result = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_A, title: 1 },
    });
    expect(ran).toBe(false);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
  });

  it("lists only allowlisted Organizations with live Membership for that OAuth client", async () => {
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_A, ORG_C],
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CLAUDE,
      userId: USER_ID,
      organizationIds: [ORG_B],
    });
    const cursorList = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: LIST_ORGANIZATIONS_MCP_CALL,
      arguments: {},
    });
    expect(cursorList.isOk()).toBe(true);
    if (cursorList.isOk()) {
      expect(cursorList.value).toEqual([{ id: ORG_A, name: "Acme", organizationRole: "owner" }]);
    }
    const claudeList = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CLAUDE,
      name: LIST_ORGANIZATIONS_MCP_CALL,
      arguments: {},
    });
    expect(claudeList.isOk()).toBe(true);
    if (claudeList.isOk()) {
      expect(claudeList.value).toEqual([{ id: ORG_B, name: "Beta", organizationRole: "member" }]);
    }

    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title),
    });
    const cursorOnClaudeOrg = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_B, title: "Hello" },
    });
    expect(cursorOnClaudeOrg.isErr()).toBe(true);
    if (cursorOnClaudeOrg.isErr()) {
      expect(cursorOnClaudeOrg.error.code).toBe("FORBIDDEN");
      expect(cursorOnClaudeOrg.error.context?.reason).toBe("allowlist");
    }
  });

  it("returns none and fails app MCP calls when the allowlist is empty", async () => {
    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async (input: { title: string }) => input.title),
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [],
    });
    const listed = await mcp.listOrganizations({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
    });
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toEqual([]);
    }
    const invoked = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_A, title: "Hello" },
    });
    expect(invoked.isErr()).toBe(true);
    if (invoked.isErr()) {
      expect(invoked.error.code).toBe("FORBIDDEN");
    }
  });

  it("does not treat an invited or soft-deleted Membership as an OrganizationActor", async () => {
    mcp.registerService({
      announce: mcp
        .description("Announce")
        .input(z.object({ title: z.string() }))
        .handle(async () => "ok"),
    });
    await mcp.replaceAllowlist({
      oauthClientId: CLIENT_CURSOR,
      userId: USER_ID,
      organizationIds: [ORG_C],
    });
    const result = await mcp.invoke({
      userId: USER_ID,
      oauthClientId: CLIENT_CURSOR,
      name: "announce",
      arguments: { organizationId: ORG_C, title: "Hello" },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.context?.reason).toBe("membership");
    }
  });
});
