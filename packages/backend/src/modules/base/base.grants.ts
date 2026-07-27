import { err, ok } from "neverthrow";
import type { ServiceActor } from "./base.actor";
import type { ServerResultAsync } from "./base.dto";

type Level = "user" | "team" | "organization";
type Access = "all" | "own";
type Ownership = "member" | "organization";

export type Entity = Partial<{
  userId: string | null;
  memberId: string | null;
  teamId: string | null;
  organizationId: string | null;
  ownership: Ownership | null;
}>;

export type PermissionCheckOptions = {
  ownership?: boolean;
};

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
  memberId: string | null;
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

/**
 * Ownership principal for "user"-level (personal) grants:
 * - In org context with a memberId on the actor, prefer memberId ownership.
 * - Fall back to userId only when the entity has no memberId (legacy rows)
 *   or the actor has no organization member context (personal resources).
 */
function getUserLevelOwnership(
  ctx: ContextValues,
  entities?: Entity | Entity[]
): { field: keyof Entity; value: string | null } {
  const inOrgContext = Boolean(ctx.organizationId && ctx.memberId);
  if (inOrgContext) {
    const entityList = !entities ? [] : Array.isArray(entities) ? entities : [entities];
    const hasMemberId = entityList.length === 0 || entityList.some((e) => e.memberId != null);
    if (hasMemberId) {
      return { field: "memberId", value: ctx.memberId };
    }
  }
  return { field: "userId", value: ctx.userId };
}

function getContextValueForLevel(level: GrantLevel, ctx: ContextValues): string | null {
  switch (level) {
    case "user":
      return ctx.memberId && ctx.organizationId ? ctx.memberId : ctx.userId;
    case "team":
      return ctx.teamId;
    case "organization":
      return ctx.organizationId;
  }
}

function getOwnershipFieldForLevel(level: GrantLevel, ctx: ContextValues): keyof Entity {
  switch (level) {
    case "user":
      return ctx.memberId && ctx.organizationId ? "memberId" : "userId";
    case "team":
      return "teamId";
    case "organization":
      return "organizationId";
  }
}

function hasAllAccess(
  grants: ResourceActionGrant[],
  roles: RoleContext,
  levels: readonly GrantLevel[] = LEVEL_PRIORITY
): boolean {
  for (const level of levels) {
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
  entities: Entity | Entity[] | undefined,
  levels: readonly GrantLevel[] = LEVEL_PRIORITY
): boolean {
  for (const level of levels) {
    for (const grant of grants) {
      if (grant.level !== level) continue;
      if (grant.access !== "own") continue;
      if (grant.role !== getRoleForLevel(level, roles)) continue;

      if (level === "user") {
        const { field, value } = getUserLevelOwnership(contextValues, entities);
        if (checkOwnership(field, value, entities)) return true;
        // Legacy dual-read: org assets without memberId still compare userId
        if (
          field === "memberId" &&
          entities &&
          (Array.isArray(entities) ? entities : [entities]).some((e) => e.memberId == null) &&
          checkOwnership("userId", contextValues.userId, entities)
        ) {
          return true;
        }
        continue;
      }

      const ownershipField = getOwnershipFieldForLevel(level, contextValues);
      const contextValue = getContextValueForLevel(level, contextValues);

      if (checkOwnership(ownershipField, contextValue, entities)) return true;
    }
  }
  return false;
}

function getOwnershipGrantLevel(entity: Entity): GrantLevel | null {
  switch (entity.ownership) {
    case "member":
      return "user";
    case "organization":
      return "organization";
    default:
      return null;
  }
}

function checkOwnershipAwareAccess(
  grants: ResourceActionGrant[],
  roles: RoleContext,
  contextValues: ContextValues,
  entities: Entity | Entity[] | undefined
): boolean {
  if (!entities) return false;

  const entityList = Array.isArray(entities) ? entities : [entities];
  if (entityList.length === 0) return false;

  return entityList.every((entity) => {
    const level = getOwnershipGrantLevel(entity);
    if (!level) return false;

    const levels = [level] as const;
    if (hasAllAccess(grants, roles, levels)) return true;
    return checkOwnAccess(grants, roles, contextValues, entity, levels);
  });
}

function toContextValues(actor: ServiceActor): ContextValues {
  return {
    userId: actor.userId,
    memberId: actor.memberId,
    teamId: actor.teamId,
    organizationId: actor.organizationId,
  };
}

export function checkPermissionSync<T extends Entity>(
  actor: ServiceActor,
  grants: ResourceActionGrant[],
  entities?: T | T[],
  options: PermissionCheckOptions = {}
): boolean {
  if (!grants || grants.length === 0) return false;

  const roles = {
    userRole: actor.userRole,
    teamRole: actor.teamRole,
    organizationRole: actor.organizationRole,
  };
  const contextValues = toContextValues(actor);

  if (options.ownership) {
    return checkOwnershipAwareAccess(grants, roles, contextValues, entities);
  }

  // Pass 1: Check for "all" access first (no ownership check needed)
  if (hasAllAccess(grants, roles)) return true;

  // Pass 2: Check "own" access with ownership validation
  return checkOwnAccess(grants, roles, contextValues, entities);
}

export async function checkPermissionAsync<T extends Entity>(
  actor: ServiceActor,
  grants: ResourceActionGrant[],
  getEntities: () => ServerResultAsync<T | T[] | undefined>,
  options: PermissionCheckOptions = {}
): ServerResultAsync<boolean> {
  if (!grants || grants.length === 0) return ok(false);

  const roles = {
    userRole: actor.userRole,
    teamRole: actor.teamRole,
    organizationRole: actor.organizationRole,
  };
  const contextValues = toContextValues(actor);

  if (options.ownership) {
    const entities = await getEntities();
    if (entities.isErr()) return err(entities.error);
    return ok(checkOwnershipAwareAccess(grants, roles, contextValues, entities.value));
  }

  // Pass 1: Check for "all" access first (no entity fetch needed)
  if (hasAllAccess(grants, roles)) return ok(true);

  // Pass 2: Only fetch entities if we need to check ownership
  const entities = await getEntities();
  if (entities.isErr()) return err(entities.error);
  return ok(checkOwnAccess(grants, roles, contextValues, entities.value));
}
