jest.mock("better-auth/plugins/access", () => {
  type Connector = "AND" | "OR";

  function authorizeRequest(
    roleStatements: Record<string, unknown>,
    request: any,
    connector: Connector
  ): { success: boolean } {
    const requestEntries = Object.entries(request ?? {});
    const checkResource = (resource: string, actions: readonly string[], resourceConnector: Connector) => {
      const allowed = (roleStatements as any)?.[resource] as readonly string[] | undefined;
      if (!allowed) return false;
      return resourceConnector === "OR"
        ? actions.some((a) => allowed.includes(a))
        : actions.every((a) => allowed.includes(a));
    };

    const results = requestEntries.map(([resource, value]) => {
      if (Array.isArray(value)) {
        return checkResource(resource, value, connector);
      }
      if (value && typeof value === "object" && "actions" in value) {
        const v = value as { actions: readonly string[]; connector?: Connector };
        return checkResource(resource, v.actions, v.connector ?? connector);
      }
      return false;
    });

    const success = connector === "OR" ? results.some(Boolean) : results.every(Boolean);
    return { success };
  }

  return {
    createAccessControl: (_statements: unknown) => ({
      newRole: (roleStatements: Record<string, unknown>) => ({
        authorize: (request: any, connector: Connector = "AND") =>
          authorizeRequest(roleStatements, request, connector),
      }),
    }),
  };
});

import { createClient } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import fs from "fs";
import path from "path";
import { AccessRepository } from "./access.repository";
import { AccessService } from "./access.service";
import { createAccessRoles } from "./access.utils";
import * as authSchema from "../auth/auth.db";

describe("AccessService", () => {
  const statements = {
    project: ["create", "share", "update", "delete"],
  } as const;

  const roleDefinitions = {
    user: {
      admin: { project: ["create", "share", "update"] },
    },
    team: {
      admin: { project: ["create", "share", "update"] },
    },
    organization: {
      admin: { project: ["create", "share", "update"] },
    },
  } as const;

  const acr = createAccessRoles(statements, roleDefinitions);
  // Minimal repository stub; not used by authorize() unit tests
  const accessService = new AccessService({ access: {} as unknown as AccessRepository }, acr);

  describe("user level", () => {
    it("allows defined action", () => {
      expect(accessService.authorize("user", "admin", { project: ["create"] })).toBe(true);
    });

    it("denies undefined action", () => {
      expect(accessService.authorize("user", "admin", { project: ["delete"] })).toBe(false);
    });

    it("handles AND vs OR connectors for multiple actions", () => {
      // admin has create but not delete
      expect(
        accessService.authorize("user", "admin", { project: ["create", "delete"] }, "AND")
      ).toBe(false);
      expect(
        accessService.authorize(
          "user",
          "admin",
          { project: { actions: ["create", "delete"], connector: "OR" } },
          "OR"
        )
      ).toBe(true);
    });
  });

  describe("team level", () => {
    it("allows defined action", () => {
      expect(accessService.authorize("team", "admin", { project: ["share"] })).toBe(true);
    });

    it("denies undefined action", () => {
      expect(accessService.authorize("team", "admin", { project: ["delete"] })).toBe(false);
    });
  });

  describe("organization level", () => {
    it("allows defined action", () => {
      expect(accessService.authorize("organization", "admin", { project: ["update"] })).toBe(true);
    });

    it("denies undefined action", () => {
      expect(accessService.authorize("organization", "admin", { project: ["delete"] })).toBe(false);
    });
  });
});

describe("AccessRepository (libsql local)", () => {
  const dbFile = path.join(__dirname, "access.test.sqlite");
  const url = `file:${dbFile}`;
  const client = createClient({ url });
  type Schema = typeof authSchema;
  type Orm = LibSQLDatabase<Schema>;
  const orm = drizzle(client, { schema: authSchema }) as Orm;
  const repo = new AccessRepository({ orm, schema: authSchema as Schema }, {});

  beforeAll(async () => {
    // Create minimal tables required for tests
    await client.execute(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL
      );
    `);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS teammembers (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL
      );
    `);
  });

  beforeEach(async () => {
    await client.execute({
      sql: "INSERT INTO members (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)",
      args: ["m1", "org1", "user1", "admin"],
    });
    await client.execute({
      sql: "INSERT INTO teammembers (id, team_id, user_id, role) VALUES (?, ?, ?, ?)",
      args: ["tm1", "team1", "user1", "admin"],
    });
  });

  afterEach(async () => {
    await client.execute("DELETE FROM members;");
    await client.execute("DELETE FROM teammembers;");
  });

  afterAll(async () => {
    try {
      await client.close();
    } catch {}
    try {
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    } catch {}
  });

  it("returns organization role for user", async () => {
    const res = await repo.getOrganizationRole("user1", "org1");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) expect(res.value).toBe("admin");
  });

  it("returns team role for user", async () => {
    const res = await repo.getTeamRole("user1", "team1");
    expect(res.isOk()).toBe(true);
    if (res.isOk()) expect(res.value).toBe("admin");
  });

  describe("AccessService.hasAccess (with repo)", () => {
    const hasAccessStatements = {
      project: ["create", "share", "update", "delete"],
    } as const;

    const hasAccessRoles = {
      user: {
        member: { project: ["create"] },
      },
      team: {
        manager: { project: ["share"] },
      },
      organization: {
        manager: { project: ["update"] },
      },
    } as const;

    const acr2 = createAccessRoles(hasAccessStatements, hasAccessRoles);
    const service = new AccessService({ access: repo }, acr2);

    it("admin override grants access", async () => {
      const result = await service.hasAccess(
        { id: "any", role: "admin" },
        "organization",
        "whatever",
        { project: ["delete"] }
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
    });

    it("user level access only for self and allowed action", async () => {
      const allowSelf = await service.hasAccess({ id: "user2", role: "member" }, "user", "user2", {
        project: ["create"],
      });
      expect(allowSelf.isOk()).toBe(true);
      if (allowSelf.isOk()) expect(allowSelf.value).toBe(true);

      const denyOther = await service.hasAccess({ id: "user2", role: "member" }, "user", "other", {
        project: ["create"],
      });
      expect(denyOther.isOk()).toBe(true);
      if (denyOther.isOk()) expect(denyOther.value).toBe(false);
    });

    it("organization membership grants access based on repo role", async () => {
      await client.execute({
        sql: "INSERT INTO members (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)",
        args: ["m2", "org2", "user2", "manager"],
      });
      const result = await service.hasAccess(
        { id: "user2", role: "member" },
        "organization",
        "org2",
        { project: ["update"] }
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
    });

    it("team membership grants access based on repo role", async () => {
      await client.execute({
        sql: "INSERT INTO teammembers (id, team_id, user_id, role) VALUES (?, ?, ?, ?)",
        args: ["tm2", "team2", "user2", "manager"],
      });
      const result = await service.hasAccess({ id: "user2", role: "member" }, "team", "team2", {
        project: ["share"],
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
    });
  });
});
