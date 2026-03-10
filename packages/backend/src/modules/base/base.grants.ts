import { err, ok } from "neverthrow";
import type { Session, User } from "../auth/auth.lib";
import type { ServerResultAsync } from "./base.dto";

type Level = "user" | "team" | "organization";
type Access = "all" | "own";

export type Entity = Partial<{
  userId: string | null;
  teamId: string | null;
  organizationId: string | null;
}>;

export type Grant = {
  level: Level;
  role: string;
  action: string;
  resource: string;
  access: Access;
  attributes?: string[];
};

export type NestedGrants = Record<
  string,
  Partial<Record<Level, Record<string, Record<string, Access>>>>
>;

export type ResourceGrant = Omit<Grant, "resource">;

export type ResourceActionGrant = Omit<ResourceGrant, "action">;

export function flattenNestedGrants(nestedGrants: NestedGrants): Grant[] {
  return Object.entries(nestedGrants).flatMap(([resource, levels]) => {
    return Object.entries(levels).flatMap(([level, roles]) => {
      return Object.entries(roles).flatMap(([role, actions]) => {
        return Object.entries(actions).map(([action, access]) => {
          return {
            resource,
            level: level as Level,
            role,
            action,
            access,
          };
        });
      });
    });
  });
}

function checkOwnership(
  entityField: keyof Entity,
  contextValue: string | null | undefined,
  entities?: Entity | Entity[]
): boolean {
  if (!contextValue) return false;
  if (!entities) return false;
  return Array.isArray(entities)
    ? entities.every((e) => e[entityField] === contextValue)
    : entities[entityField] === contextValue;
}

interface PermissionContext {
  session: Session;
  user: User;
}

type GrantLevel = "user" | "team" | "organization";

// Level priority: user -> team -> organization (bottom-up)
const LEVEL_PRIORITY: readonly GrantLevel[] = ["user", "team", "organization"];

interface RoleContext {
  userRole: string | null;
  teamRole: string | null;
  organizationRole: string | null;
}

interface ContextValues {
  userId: string;
  teamId: string | null;
  organizationId: string | null;
}

function getRoleForLevel(level: GrantLevel, ctx: RoleContext): string | null {
  switch (level) {
    case "user":
      return ctx.userRole;
    case "team":
      return ctx.teamRole;
    case "organization":
      return ctx.organizationRole;
  }
}

function getContextValueForLevel(level: GrantLevel, ctx: ContextValues): string | null {
  switch (level) {
    case "user":
      return ctx.userId;
    case "team":
      return ctx.teamId;
    case "organization":
      return ctx.organizationId;
  }
}

function getOwnershipFieldForLevel(level: GrantLevel): keyof Entity {
  switch (level) {
    case "user":
      return "userId";
    case "team":
      return "teamId";
    case "organization":
      return "organizationId";
  }
}

function hasAllAccess(grants: ResourceActionGrant[], roles: RoleContext): boolean {
  for (const level of LEVEL_PRIORITY) {
    for (const grant of grants) {
      if (grant.level !== level) continue;
      if (grant.access !== "all") continue;
      if (grant.role === getRoleForLevel(level, roles)) return true;
    }
  }
  return false;
}

function checkOwnAccess(
  grants: ResourceActionGrant[],
  roles: RoleContext,
  contextValues: ContextValues,
  entities: Entity | Entity[] | undefined
): boolean {
  for (const level of LEVEL_PRIORITY) {
    for (const grant of grants) {
      if (grant.level !== level) continue;
      if (grant.access !== "own") continue;
      if (grant.role !== getRoleForLevel(level, roles)) continue;

      const ownershipField = getOwnershipFieldForLevel(level);
      const contextValue = getContextValueForLevel(level, contextValues);

      if (checkOwnership(ownershipField, contextValue, entities)) return true;
    }
  }
  return false;
}

export function checkPermissionSync<T extends Entity>(
  ctx: PermissionContext,
  grants: ResourceActionGrant[],
  entities?: T | T[]
): boolean {
  if (!grants || grants.length === 0) return false;

  const { id: userId, role: userRole } = ctx.user;
  const {
    activeOrganizationRole: organizationRole,
    activeTeamRole: teamRole,
    activeOrganizationId: organizationId,
    activeTeamId: teamId,
  } = ctx.session;

  const roles = { userRole, teamRole, organizationRole };
  const contextValues = { userId, teamId, organizationId };

  // Pass 1: Check for "all" access first (no ownership check needed)
  if (hasAllAccess(grants, roles)) return true;

  // Pass 2: Check "own" access with ownership validation
  return checkOwnAccess(grants, roles, contextValues, entities);
}

export async function checkPermissionAsync<T extends Entity>(
  ctx: PermissionContext,
  grants: ResourceActionGrant[],
  getEntities: () => ServerResultAsync<T | T[] | undefined>
): ServerResultAsync<boolean> {
  if (!grants || grants.length === 0) return ok(false);

  const { id: userId, role: userRole } = ctx.user;
  const {
    activeOrganizationRole: organizationRole,
    activeTeamRole: teamRole,
    activeOrganizationId: organizationId,
    activeTeamId: teamId,
  } = ctx.session;

  const roles = { userRole, teamRole, organizationRole };
  const contextValues = { userId, teamId, organizationId };

  // Pass 1: Check for "all" access first (no entity fetch needed)
  if (hasAllAccess(grants, roles)) return ok(true);

  // Pass 2: Only fetch entities if we need to check ownership
  const entities = await getEntities();
  if (entities.isErr()) return err(entities.error);
  return ok(checkOwnAccess(grants, roles, contextValues, entities.value));
}
