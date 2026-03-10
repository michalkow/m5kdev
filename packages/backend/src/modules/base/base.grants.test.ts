import { err, ok } from "neverthrow";
import type { Session, User } from "../auth/auth.lib";
import {
  checkPermissionAsync,
  checkPermissionSync,
  type Entity,
  flattenNestedGrants,
  type NestedGrants,
  type ResourceActionGrant,
} from "./base.grants";
import { ServerError } from "../../utils/errors";

// ============================================
// Mock Factories
// ============================================

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-123",
    role: "member",
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date(),
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

function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-123",
    userId: "user-123",
    token: "token-123",
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    activeOrganizationId: null,
    activeTeamId: null,
    activeOrganizationRole: null,
    activeTeamRole: null,
    ...overrides,
  } as Session;
}

function createMockContext(
  userOverrides: Partial<User> = {},
  sessionOverrides: Partial<Session> = {}
): { session: Session; user: User } {
  return {
    user: createMockUser(userOverrides),
    session: createMockSession(sessionOverrides),
  };
}

function createMockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    userId: "user-123",
    teamId: undefined,
    organizationId: undefined,
    ...overrides,
  };
}

// ============================================
// flattenNestedGrants
// ============================================

describe("flattenNestedGrants", () => {
  it("converts permission object to grants array", () => {
    const permission: NestedGrants = {
      posts: {
        user: {
          member: { read: "own", create: "own" },
        },
        team: {
          admin: { write: "all" },
        },
      },
    };

    const result = flattenNestedGrants(permission);

    expect(result).toHaveLength(3);
    expect(result).toContainEqual({
      resource: "posts",
      level: "user",
      role: "member",
      action: "read",
      access: "own",
    });
    expect(result).toContainEqual({
      resource: "posts",
      level: "user",
      role: "member",
      action: "create",
      access: "own",
    });
    expect(result).toContainEqual({
      resource: "posts",
      level: "team",
      role: "admin",
      action: "write",
      access: "all",
    });
  });

  it("handles multiple resources", () => {
    const permission: NestedGrants = {
      posts: {
        user: { member: { read: "own" } },
      },
      comments: {
        team: { admin: { delete: "all" } },
      },
    };

    const result = flattenNestedGrants(permission);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      resource: "posts",
      level: "user",
      role: "member",
      action: "read",
      access: "own",
    });
    expect(result).toContainEqual({
      resource: "comments",
      level: "team",
      role: "admin",
      action: "delete",
      access: "all",
    });
  });

  it("handles permission with only some levels defined", () => {
    const permission: NestedGrants = {
      posts: {
        organization: {
          owner: { delete: "all" },
        },
      },
    };

    const result = flattenNestedGrants(permission);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      resource: "posts",
      level: "organization",
      role: "owner",
      action: "delete",
      access: "all",
    });
  });

  it("returns empty array for empty permission", () => {
    const result = flattenNestedGrants({});
    expect(result).toEqual([]);
  });

  it("handles multiple roles per level", () => {
    const permission: NestedGrants = {
      posts: {
        user: {
          member: { read: "own" },
          admin: { read: "all", write: "all" },
        },
      },
    };

    const result = flattenNestedGrants(permission);

    expect(result).toHaveLength(3);
    expect(result).toContainEqual({
      resource: "posts",
      level: "user",
      role: "member",
      action: "read",
      access: "own",
    });
    expect(result).toContainEqual({
      resource: "posts",
      level: "user",
      role: "admin",
      action: "read",
      access: "all",
    });
    expect(result).toContainEqual({
      resource: "posts",
      level: "user",
      role: "admin",
      action: "write",
      access: "all",
    });
  });
});

// ============================================
// checkPermissionSync
// ============================================

describe("checkPermissionSync", () => {
  describe("edge cases", () => {
    it("returns false for empty grants array", () => {
      const ctx = createMockContext();
      const result = checkPermissionSync(ctx, []);
      expect(result).toBe(false);
    });

    it("returns false for undefined grants", () => {
      const ctx = createMockContext();
      const result = checkPermissionSync(ctx, undefined as unknown as ResourceActionGrant[]);
      expect(result).toBe(false);
    });
  });

  describe("user-level permissions", () => {
    it("grants access with 'all' access regardless of entity", () => {
      const ctx = createMockContext({ role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "all" }];

      // No entity provided
      expect(checkPermissionSync(ctx, grants)).toBe(true);

      // Entity with different userId - still allowed because "all" access
      expect(checkPermissionSync(ctx, grants, { userId: "other-user" })).toBe(true);
    });

    it("grants access with 'own' access when userId matches", () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];
      const entity = createMockEntity({ userId: "user-123" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("denies access with 'own' access when userId does not match", () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];
      const entity = createMockEntity({ userId: "other-user" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(false);
    });

    it("denies access with 'own' access when no entity provided", () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];

      expect(checkPermissionSync(ctx, grants)).toBe(false);
    });

    it("denies access when user role does not match grant role", () => {
      const ctx = createMockContext({ role: "viewer" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "admin", access: "all" }];

      expect(checkPermissionSync(ctx, grants)).toBe(false);
    });
  });

  describe("team-level permissions", () => {
    it("grants access with 'all' access when team role matches", () => {
      const ctx = createMockContext({}, { activeTeamId: "team-1", activeTeamRole: "admin" });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "admin", access: "all" }];

      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("grants access with 'own' access when teamId matches", () => {
      const ctx = createMockContext({}, { activeTeamId: "team-1", activeTeamRole: "member" });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "member", access: "own" }];
      const entity = createMockEntity({ teamId: "team-1" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("denies access with 'own' access when teamId does not match", () => {
      const ctx = createMockContext({}, { activeTeamId: "team-1", activeTeamRole: "member" });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "member", access: "own" }];
      const entity = createMockEntity({ teamId: "team-2" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(false);
    });

    it("denies access when team role does not match", () => {
      const ctx = createMockContext({}, { activeTeamId: "team-1", activeTeamRole: "viewer" });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "admin", access: "all" }];

      expect(checkPermissionSync(ctx, grants)).toBe(false);
    });

    it("denies access when no active team", () => {
      const ctx = createMockContext({}, { activeTeamId: null, activeTeamRole: null });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "admin", access: "all" }];

      expect(checkPermissionSync(ctx, grants)).toBe(false);
    });
  });

  describe("organization-level permissions", () => {
    it("grants access with 'all' access when organization role matches", () => {
      const ctx = createMockContext(
        {},
        { activeOrganizationId: "org-1", activeOrganizationRole: "owner" }
      );
      const grants: ResourceActionGrant[] = [
        { level: "organization", role: "owner", access: "all" },
      ];

      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("grants access with 'own' access when organizationId matches", () => {
      const ctx = createMockContext(
        {},
        { activeOrganizationId: "org-1", activeOrganizationRole: "member" }
      );
      const grants: ResourceActionGrant[] = [
        { level: "organization", role: "member", access: "own" },
      ];
      const entity = createMockEntity({ organizationId: "org-1" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("denies access with 'own' access when organizationId does not match", () => {
      const ctx = createMockContext(
        {},
        { activeOrganizationId: "org-1", activeOrganizationRole: "member" }
      );
      const grants: ResourceActionGrant[] = [
        { level: "organization", role: "member", access: "own" },
      ];
      const entity = createMockEntity({ organizationId: "org-2" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(false);
    });
  });

  describe("multiple grants", () => {
    it("checks 'all' access before 'own' access (optimization)", () => {
      const ctx = createMockContext({ id: "user-123", role: "admin" });
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" }, // Would need entity check
        { level: "user", role: "admin", access: "all" }, // Should match first in pass 1
      ];

      // No entity provided, but should still pass because "all" is checked first
      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("falls back to 'own' access if no 'all' access matches", () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "admin", access: "all" }, // Role doesn't match
        { level: "user", role: "member", access: "own" }, // Should match in pass 2
      ];
      const entity = createMockEntity({ userId: "user-123" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("grants access if any level matches with 'all'", () => {
      const ctx = createMockContext(
        { role: "viewer" },
        { activeTeamId: "team-1", activeTeamRole: "admin" }
      );
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "all" }, // User role doesn't match
        { level: "team", role: "admin", access: "all" }, // Team role matches
      ];

      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });
  });

  describe("multiple entities", () => {
    it("requires all entities to match for 'own' access", () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];

      const matchingEntities = [{ userId: "user-123" }, { userId: "user-123" }];
      expect(checkPermissionSync(ctx, grants, matchingEntities)).toBe(true);

      const mixedEntities = [{ userId: "user-123" }, { userId: "other-user" }];
      expect(checkPermissionSync(ctx, grants, mixedEntities)).toBe(false);
    });

    it("denies access if any entity does not match", () => {
      const ctx = createMockContext({}, { activeTeamId: "team-1", activeTeamRole: "member" });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "member", access: "own" }];

      const entities = [{ teamId: "team-1" }, { teamId: "team-1" }, { teamId: "team-2" }];
      expect(checkPermissionSync(ctx, grants, entities)).toBe(false);
    });
  });

  describe("level priority (user -> team -> organization)", () => {
    it("checks user level before team level", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        { activeTeamId: "team-1", activeTeamRole: "member" }
      );

      // Both levels have matching grants, but user should be checked first
      const grants: ResourceActionGrant[] = [
        { level: "team", role: "member", access: "own" },
        { level: "user", role: "member", access: "all" },
      ];

      // Should return true from user-level "all" without needing entity
      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("checks team level before organization level", () => {
      const ctx = createMockContext(
        { role: "viewer" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "admin",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "admin",
        }
      );

      const grants: ResourceActionGrant[] = [
        { level: "organization", role: "admin", access: "all" },
        { level: "team", role: "admin", access: "all" },
      ];

      // Both would match, but team is checked before org in the priority
      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });
  });

  describe("multi-level grants with different roles per level", () => {
    it("user with different roles at each level - matches user level", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "viewer" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "admin",
        }
      );

      // Grant requires "viewer" at user level
      const grants: ResourceActionGrant[] = [{ level: "user", role: "viewer", access: "all" }];

      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("user with different roles at each level - matches team level only", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "viewer" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "manager",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // Grant requires "admin" at user level (no match) or "manager" at team level (match)
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "admin", access: "all" },
        { level: "team", role: "manager", access: "all" },
      ];

      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("user with different roles at each level - matches organization level only", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "viewer" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "owner",
        }
      );

      // Grant requires roles that only match at organization level
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "admin", access: "all" },
        { level: "team", role: "admin", access: "all" },
        { level: "organization", role: "owner", access: "all" },
      ];

      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("user with different roles at each level - no level matches", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "viewer" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // Grant requires roles that don't match any level
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "admin", access: "all" },
        { level: "team", role: "admin", access: "all" },
        { level: "organization", role: "owner", access: "all" },
      ];

      expect(checkPermissionSync(ctx, grants)).toBe(false);
    });

    it("user with mixed 'all' and 'own' grants across levels - 'all' wins", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "admin",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // User level has "own" (would need entity), team level has "all" (no entity needed)
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" },
        { level: "team", role: "admin", access: "all" },
        { level: "organization", role: "owner", access: "own" },
      ];

      // Should pass because team-level "all" is checked in pass 1
      expect(checkPermissionSync(ctx, grants)).toBe(true);
    });

    it("user with 'own' grants at multiple levels - first matching level wins", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // All levels have "own" access, entity matches user level
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" },
        { level: "team", role: "member", access: "own" },
        { level: "organization", role: "member", access: "own" },
      ];

      const entity = createMockEntity({
        userId: "user-123",
        teamId: "team-2",
        organizationId: "org-2",
      });

      // Should pass because user-level "own" matches (checked first in pass 2)
      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("user with 'own' grants - team level matches when user level does not", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" },
        { level: "team", role: "member", access: "own" },
        { level: "organization", role: "member", access: "own" },
      ];

      // Entity belongs to a different user but same team
      const entity = createMockEntity({
        userId: "other-user",
        teamId: "team-1",
        organizationId: "org-2",
      });

      // User-level fails (userId mismatch), team-level passes (teamId matches)
      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("user with 'own' grants - organization level matches when user and team do not", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" },
        { level: "team", role: "member", access: "own" },
        { level: "organization", role: "member", access: "own" },
      ];

      // Entity belongs to a different user and team, but same organization
      const entity = createMockEntity({
        userId: "other-user",
        teamId: "team-2",
        organizationId: "org-1",
      });

      // User-level fails, team-level fails, organization-level passes
      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("complex scenario: admin user bypasses ownership checks", () => {
      const ctx = createMockContext(
        { id: "admin-user", role: "admin" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // Grant allows admins to access all, or regular members to access own
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "admin", access: "all" },
        { level: "user", role: "member", access: "own" },
      ];

      // Entity belongs to someone else, but admin has "all" access
      const entity = createMockEntity({ userId: "other-user" });

      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("complex scenario: regular user limited to own resources", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // Grant allows admins to access all, or regular members to access own
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "admin", access: "all" },
        { level: "user", role: "member", access: "own" },
      ];

      // Entity belongs to someone else - member can't access
      const otherEntity = createMockEntity({ userId: "other-user" });
      expect(checkPermissionSync(ctx, grants, otherEntity)).toBe(false);

      // Entity belongs to the user - member can access
      const ownEntity = createMockEntity({ userId: "user-123" });
      expect(checkPermissionSync(ctx, grants, ownEntity)).toBe(true);
    });

    it("team admin can access all team resources regardless of user ownership", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "admin",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "member",
        }
      );

      // Grant: user-level own OR team-level all for admins
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" },
        { level: "team", role: "admin", access: "all" },
      ];

      // Entity belongs to another user in the same team
      const entity = createMockEntity({ userId: "other-user", teamId: "team-1" });

      // Team admin has "all" access, so ownership doesn't matter
      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });

    it("organization owner can access all organization resources", () => {
      const ctx = createMockContext(
        { id: "user-123", role: "member" },
        {
          activeTeamId: "team-1",
          activeTeamRole: "member",
          activeOrganizationId: "org-1",
          activeOrganizationRole: "owner",
        }
      );

      // Grant: owner at org level has all access
      const grants: ResourceActionGrant[] = [
        { level: "user", role: "member", access: "own" },
        { level: "team", role: "admin", access: "own" },
        { level: "organization", role: "owner", access: "all" },
      ];

      // Entity belongs to another user and team, but in the same org
      const entity = createMockEntity({
        userId: "other-user",
        teamId: "team-2",
        organizationId: "org-1",
      });

      // Org owner has "all" access
      expect(checkPermissionSync(ctx, grants, entity)).toBe(true);
    });
  });
});

// ============================================
// checkPermissionAsync
// ============================================

describe("checkPermissionAsync", () => {
  describe("edge cases", () => {
    it("returns ok(false) for empty grants array", async () => {
      const ctx = createMockContext();
      const getEntities = jest.fn();

      const result = await checkPermissionAsync(ctx, [], getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(false);
      expect(getEntities).not.toHaveBeenCalled();
    });
  });

  describe("'all' access optimization", () => {
    it("returns ok(true) without calling getEntities when 'all' access matches", async () => {
      const ctx = createMockContext({ role: "admin" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "admin", access: "all" }];
      const getEntities = jest.fn();

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
      expect(getEntities).not.toHaveBeenCalled();
    });
  });

  describe("'own' access with entity fetch", () => {
    it("calls getEntities and grants access when ownership matches", async () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];
      const entity = createMockEntity({ userId: "user-123" });
      const getEntities = jest.fn().mockResolvedValue(ok(entity));

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
      expect(getEntities).toHaveBeenCalledTimes(1);
    });

    it("calls getEntities and denies access when ownership does not match", async () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];
      const entity = createMockEntity({ userId: "other-user" });
      const getEntities = jest.fn().mockResolvedValue(ok(entity));

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(false);
      expect(getEntities).toHaveBeenCalledTimes(1);
    });

    it("handles undefined entities from getEntities", async () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];
      const getEntities = jest.fn().mockResolvedValue(ok(undefined));

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(false);
    });
  });

  describe("error propagation", () => {
    it("propagates errors from getEntities", async () => {
      const ctx = createMockContext({ id: "user-123", role: "member" });
      const grants: ResourceActionGrant[] = [{ level: "user", role: "member", access: "own" }];
      const mockError = new ServerError({
        layer: "service",
        layerName: "BasePermissionService",
        code: "NOT_FOUND",
        message: "Entity not found",
        cause: null,
      });
      const getEntities = jest.fn().mockResolvedValue(err(mockError));

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("NOT_FOUND");
        expect(result.error.message).toBe("Entity not found");
      }
    });
  });

  describe("team and organization levels", () => {
    it("checks team-level 'own' access correctly", async () => {
      const ctx = createMockContext({}, { activeTeamId: "team-1", activeTeamRole: "member" });
      const grants: ResourceActionGrant[] = [{ level: "team", role: "member", access: "own" }];
      const entity = createMockEntity({ teamId: "team-1" });
      const getEntities = jest.fn().mockResolvedValue(ok(entity));

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
    });

    it("checks organization-level 'all' access without fetching entities", async () => {
      const ctx = createMockContext(
        {},
        { activeOrganizationId: "org-1", activeOrganizationRole: "owner" }
      );
      const grants: ResourceActionGrant[] = [
        { level: "organization", role: "owner", access: "all" },
      ];
      const getEntities = jest.fn();

      const result = await checkPermissionAsync(ctx, grants, getEntities);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe(true);
      expect(getEntities).not.toHaveBeenCalled();
    });
  });
});
