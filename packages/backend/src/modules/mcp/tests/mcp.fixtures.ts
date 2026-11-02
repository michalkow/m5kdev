import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createTestPool, prepareTestSchema } from "../../../test/postgresql";
import * as authTables from "../../auth/auth.db";
import { AuthOrganizationRepository, AuthUserRepository } from "../../auth/auth.repository";
import { mcpAllowlistEntries } from "../mcp.db";
import { McpRepository } from "../mcp.repository";
import { McpService } from "../mcp.service";

export const MCP_USER_ID = "user-1";
export const MCP_USER_ROLE = "user";
export const MCP_ORG_A = "org-a";
export const MCP_ORG_B = "org-b";
export const MCP_ORG_C = "org-c";
export const MCP_MEMBER_A = "member-a";
export const MCP_MEMBER_B = "member-b";
export const MCP_CLIENT_CURSOR = "oauth-cursor";
export const MCP_CLIENT_CLAUDE = "oauth-claude";

export const mcpTestSchema = {
  ...authTables,
  mcpAllowlistEntries,
};

export async function createMcpTables(client: Pool): Promise<void> {
  const namespace = await prepareTestSchema(client);
  await client.query(`
    CREATE TABLE "${namespace}".users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      role TEXT,
      banned BOOLEAN,
      ban_reason TEXT,
      ban_expires TIMESTAMPTZ,
      preferences JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT[] DEFAULT '{}',
      locale TEXT,
      closed_at TIMESTAMPTZ
    );
  `);
  await client.query(`
    CREATE TABLE "${namespace}".organizations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      logo TEXT,
      type TEXT,
      parent_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      onboarding INTEGER,
      preferences JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      flags TEXT[] DEFAULT '{}',
      locale TEXT,
      currency TEXT,
      stripe_customer_id TEXT UNIQUE,
      stripe_sandbox_customer_id TEXT UNIQUE,
      billing_exempt BOOLEAN NOT NULL DEFAULT false,
      allow_cardless_trial BOOLEAN NOT NULL DEFAULT false,
      cardless_trial_consumed JSONB DEFAULT '{}',
      closed_at TIMESTAMPTZ
    );
  `);
  await client.query(`
    CREATE TABLE "${namespace}".members (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL REFERENCES "${namespace}".organizations(id),
      user_id TEXT REFERENCES "${namespace}".users(id),
      email TEXT,
      name TEXT NOT NULL DEFAULT '',
      image TEXT,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      deleted_at TIMESTAMPTZ,
      preferences JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT[] DEFAULT '{}'
    );
  `);
  await client.query(`
    CREATE TABLE "${namespace}".invitations (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      member_id TEXT,
      email TEXT NOT NULL,
      role TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      inviter_id TEXT NOT NULL
    );
  `);
  await client.query(`
    CREATE TABLE "${namespace}".mcp_allowlist_entries (
      id TEXT PRIMARY KEY NOT NULL,
      oauth_client_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES "${namespace}".users(id),
      organization_id TEXT NOT NULL REFERENCES "${namespace}".organizations(id),
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE (oauth_client_id, user_id, organization_id)
    );
  `);
}

export async function seedMcpFixture(client: Pool): Promise<void> {
  const orm = drizzle(client, { schema: mcpTestSchema });
  await orm.insert(authTables.users).values({
    id: MCP_USER_ID,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    role: MCP_USER_ROLE,
  });
  await orm.insert(authTables.users).values({
    id: "admin-1",
    name: "Root",
    email: "root@example.com",
    emailVerified: true,
    role: "admin",
  });
  await orm.insert(authTables.organizations).values([
    { id: MCP_ORG_A, name: "Acme", slug: "acme" },
    { id: MCP_ORG_B, name: "Beta", slug: "beta" },
    { id: MCP_ORG_C, name: "Closed", slug: "closed" },
  ]);
  await orm.insert(authTables.members).values([
    {
      id: MCP_MEMBER_A,
      organizationId: MCP_ORG_A,
      userId: MCP_USER_ID,
      name: "Ada",
      role: "owner",
    },
    {
      id: MCP_MEMBER_B,
      organizationId: MCP_ORG_B,
      userId: MCP_USER_ID,
      name: "Ada",
      role: "member",
    },
    {
      id: "member-invited",
      organizationId: MCP_ORG_C,
      userId: null,
      name: "Invited",
      email: "invitee@example.com",
      role: "member",
    },
    {
      id: "member-deleted",
      organizationId: MCP_ORG_C,
      userId: MCP_USER_ID,
      name: "Ada",
      role: "member",
      deletedAt: new Date("2020-01-01T00:00:00.000Z"),
    },
    {
      id: "member-admin-a",
      organizationId: MCP_ORG_A,
      userId: "admin-1",
      name: "Root",
      role: "owner",
    },
  ]);
}

export function createMcpService(client: Pool): {
  mcp: McpService;
  organizations: AuthOrganizationRepository;
} {
  const orm = drizzle(client, { schema: mcpTestSchema });
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
  return {
    mcp: new McpService(mcpRepository, organizationRepository, userRepository),
    organizations: organizationRepository,
  };
}

export function createMcpTestPool(): Pool {
  return createTestPool();
}
