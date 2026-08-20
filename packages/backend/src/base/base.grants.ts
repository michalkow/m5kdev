import { err, ok } from "neverthrow";
import type { ServiceActor } from "./base.actor";
import type { ServerResultAsync } from "./base.dto";

type Level = "user" | "team" | "organization";
type Access = "all" | "own" | "org" | "none";
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
 * Per-entity user-level ownership:
 * - In org context, entities with `memberId` compare against the actor memberId.
 * - Otherwise (legacy rows or personal resources) compare `userId`.
 */
function ownsEntityAtUserLevel(ctx: ContextValues, entity: Entity): boolean {
  const inOrgContext = Boolean(ctx.organizationId && ctx.memberId);
  if (inOrgContext && entity.memberId != null) {
    return entity.memberId === ctx.memberId;
  }
  return Boolean(ctx.userId) && entity.userId === ctx.userId;
}

/**
 * User-level "own" check across a batch. Each entity is evaluated independently
 * so mixed memberId / legacy userId rows can all pass when owned by the actor.
 * Empty arrays still pass (same as `Array.every`); missing entities still deny.
 * With no entities, org-context callers previously selected the memberId field
 * then denied via `checkOwnership` — that deny is preserved here.
 */
function checkUserLevelOwnership(ctx: ContextValues, entities?: Entity | Entity[]): boolean {
  if (!entities) return false;
  const entityList = Array.isArray(entities) ? entities : [entities];
  return entityList.every((entity) => ownsEntityAtUserLevel(ctx, entity));
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

function checkOrgAccess(
  grants: ResourceActionGrant[],
  roles: RoleContext,
  contextValues: ContextValues,
  entities: Entity | Entity[] | undefined,
  levels: readonly GrantLevel[] = LEVEL_PRIORITY
): boolean {
  if (!contextValues.organizationId) return false;

  for (const level of levels) {
    for (const grant of grants) {
      if (grant.level !== level) continue;
      if (grant.access !== "org") continue;
      if (grant.role !== getRoleForLevel(level, roles)) continue;

      if (checkOwnership("organizationId", contextValues.organizationId, entities)) return true;
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
        if (checkUserLevelOwnership(contextValues, entities)) return true;
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

function evaluateEntityAccess(
  grants: ResourceActionGrant[],
  roles: RoleContext,
  contextValues: ContextValues,
  entity: Entity,
  levels: readonly GrantLevel[] = LEVEL_PRIORITY
): boolean {
  if (hasAllAccess(grants, roles, levels)) return true;
  if (checkOrgAccess(grants, roles, contextValues, entity, levels)) return true;
  return checkOwnAccess(grants, roles, contextValues, entity, levels);
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
    return evaluateEntityAccess(grants, roles, contextValues, entity, levels);
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

function toRoleContext(actor: ServiceActor): RoleContext {
  return {
    userRole: actor.userRole,
    teamRole: actor.teamRole,
    organizationRole: actor.organizationRole,
  };
}

export function checkPermissionSync<T extends Entity>(
  actor: ServiceActor,
  grants: ResourceActionGrant[],
  entities?: T | T[],
  options: PermissionCheckOptions = {}
): boolean {
  if (!grants || grants.length === 0) return false;

  const roles = toRoleContext(actor);
  const contextValues = toContextValues(actor);

  if (options.ownership) {
    return checkOwnershipAwareAccess(grants, roles, contextValues, entities);
  }

  // Pass 1: Check for "all" access first (no ownership check needed)
  if (hasAllAccess(grants, roles)) return true;

  // Pass 2: Org-scoped access (same organization)
  if (checkOrgAccess(grants, roles, contextValues, entities)) return true;

  // Pass 3: Check "own" access with ownership validation
  return checkOwnAccess(grants, roles, contextValues, entities);
}

/** Paginated list query result shape from `queryList`. */
export interface EntityListResult<T extends Entity = Entity> {
  rows: readonly T[];
  total: number;
}

export function isEntityListResult(value: unknown): value is EntityListResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { rows?: unknown; total?: unknown };
  return Array.isArray(candidate.rows) && typeof candidate.total === "number";
}

/**
 * Soft-filter entities to those the actor may access.
 * Empty input returns []. Unlike checkPermissionSync on arrays (all-must-pass),
 * this keeps only allowed rows.
 */
export function filterEntitiesByPermission<T extends Entity>(
  actor: ServiceActor,
  grants: ResourceActionGrant[],
  entities: readonly T[],
  options: PermissionCheckOptions = {}
): T[] {
  if (!entities.length) return [];
  if (!grants || grants.length === 0) return [];

  const roles = toRoleContext(actor);
  const contextValues = toContextValues(actor);

  if (!options.ownership && hasAllAccess(grants, roles)) {
    return [...entities];
  }

  return entities.filter((entity) => {
    if (options.ownership) {
      const level = getOwnershipGrantLevel(entity);
      if (!level) return false;
      return evaluateEntityAccess(grants, roles, contextValues, entity, [level] as const);
    }
    return evaluateEntityAccess(grants, roles, contextValues, entity);
  });
}

/**
 * Soft-filter a `{ rows, total }` list query result.
 * Filters `rows` and reduces `total` by the number of rows removed from this page.
 */
export function filterListResultByPermission<T extends Entity>(
  actor: ServiceActor,
  grants: ResourceActionGrant[],
  result: EntityListResult<T>,
  options: PermissionCheckOptions = {}
): EntityListResult<T> {
  const rows = filterEntitiesByPermission(actor, grants, result.rows, options);
  const removed = result.rows.length - rows.length;
  return {
    rows,
    total: Math.max(0, result.total - removed),
  };
}

export async function checkPermissionAsync<T extends Entity>(
  actor: ServiceActor,
  grants: ResourceActionGrant[],
  getEntities: () => ServerResultAsync<T | T[] | undefined>,
  options: PermissionCheckOptions = {}
): ServerResultAsync<boolean> {
  if (!grants || grants.length === 0) return ok(false);

  const roles = toRoleContext(actor);
  const contextValues = toContextValues(actor);

  if (options.ownership) {
    const entities = await getEntities();
    if (entities.isErr()) return err(entities.error);
    return ok(checkOwnershipAwareAccess(grants, roles, contextValues, entities.value));
  }

  // Pass 1: Check for "all" access first (no entity fetch needed)
  if (hasAllAccess(grants, roles)) return ok(true);

  // Pass 2/3: Fetch entities for org or own checks
  const entities = await getEntities();
  if (entities.isErr()) return err(entities.error);
  if (checkOrgAccess(grants, roles, contextValues, entities.value)) return ok(true);
  return ok(checkOwnAccess(grants, roles, contextValues, entities.value));
}
