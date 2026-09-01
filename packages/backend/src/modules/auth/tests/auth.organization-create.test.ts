import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as auth from "./auth.db";
import { createOrganizationWithOwner, getActiveOrganization } from "./auth.utils";

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
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY NOT NULL,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      impersonated_by TEXT,
      active_organization_id TEXT,
      active_organization_member_id TEXT,
      active_organization_role TEXT,
      active_organization_type TEXT
    );
  `);
}

describe("createOrganizationWithOwner", () => {
  let client: Client;
  let dbDir: string;

  beforeEach(async () => {
    dbDir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-org-create-"));
    client = createClient({ url: `file:${path.join(dbDir, "test.db")}` });
    await createTables(client);
  });

  afterEach(async () => {
    client.close();
    await fs.rm(dbDir, { recursive: true, force: true });
  });

  it("inserts Organization and Owner Membership only", async () => {
    const orm = drizzle(client, { schema: auth });
    await orm.insert(auth.users).values({
      id: "user-1",
      name: "Pat",
      email: "pat@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createOrganizationWithOwner(orm, auth, {
      id: "user-1",
      email: "pat@example.com",
      name: "Pat",
      image: null,
    });

    expect(result).toEqual({ organizationId: expect.any(String) });
    expect(result).not.toHaveProperty("teamId");

    const organizations = await orm.select().from(auth.organizations);
    const members = await orm.select().from(auth.members).where(eq(auth.members.userId, "user-1"));

    expect(organizations).toHaveLength(1);
    expect(organizations[0]?.id).toBe(result.organizationId);
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
    expect(members[0]?.organizationId).toBe(result.organizationId);
  });
});

describe("getActiveOrganization", () => {
  let client: Client;
  let dbDir: string;

  beforeEach(async () => {
    dbDir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-active-org-"));
    client = createClient({ url: `file:${path.join(dbDir, "test.db")}` });
    await createTables(client);
  });

  afterEach(async () => {
    client.close();
    await fs.rm(dbDir, { recursive: true, force: true });
  });

  it("does not treat an invited Membership as the Organization Actor", async () => {
    const orm = drizzle(client, { schema: auth });
    const now = new Date();
    await orm.insert(auth.users).values([
      {
        id: "user-owner",
        name: "Pat",
        email: "pat@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-invitee",
        name: "Ivy",
        email: "ivy@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await orm.insert(auth.organizations).values({
      id: "org-1",
      name: "Org",
      slug: "org-1",
      createdAt: now,
    });
    await orm.insert(auth.members).values([
      {
        id: "member-owner",
        organizationId: "org-1",
        userId: "user-owner",
        email: "pat@example.com",
        name: "Pat",
        role: "owner",
        createdAt: now,
      },
      {
        id: "member-invited",
        organizationId: "org-1",
        userId: null,
        email: "ivy@example.com",
        name: "Ivy",
        role: "member",
        createdAt: now,
      },
    ]);
    await orm.insert(auth.sessions).values({
      id: "session-invitee",
      token: "token-invitee",
      userId: "user-invitee",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "org-1",
      activeOrganizationMemberId: "member-invited",
      activeOrganizationRole: "member",
    });

    const invitedActor = await getActiveOrganization(orm, auth, "user-invitee");
    expect(invitedActor.organizationMemberId).toBeUndefined();
    expect(invitedActor.organizationId).toBeUndefined();

    const ownerActor = await getActiveOrganization(orm, auth, "user-owner");
    expect(ownerActor).toEqual({
      organizationId: "org-1",
      organizationRole: "owner",
      organizationType: undefined,
      organizationMemberId: "member-owner",
    });
  });
});
