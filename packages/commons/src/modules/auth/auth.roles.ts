import { z } from "zod";

export type AuthRoleScope = "user" | "organization" | "team";

export interface AuthRoleScopeConfig {
  roles: readonly string[];
  managerRoles?: readonly string[];
  assignableRoles?: readonly string[];
  defaultRole?: string;
}

export interface AuthRolesConfig {
  user: AuthRoleScopeConfig;
  organization: AuthRoleScopeConfig;
  team: AuthRoleScopeConfig;
}

export interface NormalizedAuthRoleScopeConfig {
  roles: readonly string[];
  managerRoles: readonly string[];
  assignableRoles: readonly string[];
  defaultRole: string;
}

export interface NormalizedAuthRolesConfig {
  user: NormalizedAuthRoleScopeConfig;
  organization: NormalizedAuthRoleScopeConfig;
  team: NormalizedAuthRoleScopeConfig;
}

const DEFAULT_USER_SCOPE: NormalizedAuthRoleScopeConfig = {
  roles: ["user", "admin"],
  managerRoles: ["admin"],
  assignableRoles: ["user", "admin"],
  defaultRole: "user",
};

const DEFAULT_ORGANIZATION_SCOPE: NormalizedAuthRoleScopeConfig = {
  roles: ["member", "admin", "owner"],
  managerRoles: ["admin", "owner"],
  assignableRoles: ["member", "admin", "owner"],
  defaultRole: "member",
};

const DEFAULT_TEAM_SCOPE: NormalizedAuthRoleScopeConfig = {
  roles: ["owner"],
  managerRoles: ["owner"],
  assignableRoles: ["owner"],
  defaultRole: "owner",
};

export const DEFAULT_AUTH_ROLES: NormalizedAuthRolesConfig = {
  user: DEFAULT_USER_SCOPE,
  organization: DEFAULT_ORGANIZATION_SCOPE,
  team: DEFAULT_TEAM_SCOPE,
};

function pickSubset(
  values: readonly string[],
  allowed: readonly string[],
  fallback: readonly string[]
): readonly string[] {
  const allowedSet = new Set(allowed);
  const picked = values.filter((value) => allowedSet.has(value));
  if (picked.length > 0) {
    return picked;
  }

  const fallbackPicked = fallback.filter((value) => allowedSet.has(value));
  if (fallbackPicked.length > 0) {
    return fallbackPicked;
  }

  return allowed.length > 0 ? [allowed[0]] : [];
}

export function normalizeRoleScopeConfig(
  scope: AuthRoleScopeConfig,
  defaults: NormalizedAuthRoleScopeConfig
): NormalizedAuthRoleScopeConfig {
  const roles = scope.roles.length > 0 ? scope.roles : defaults.roles;
  const roleSet = new Set(roles);

  const defaultRole =
    scope.defaultRole && roleSet.has(scope.defaultRole)
      ? scope.defaultRole
      : defaults.defaultRole && roleSet.has(defaults.defaultRole)
        ? defaults.defaultRole
        : roles[0];

  const managerRoles = pickSubset(
    scope.managerRoles ?? defaults.managerRoles,
    roles,
    defaults.managerRoles
  );

  const assignableRoles = pickSubset(
    scope.assignableRoles ?? roles,
    roles,
    roles
  );

  return {
    roles,
    managerRoles,
    assignableRoles,
    defaultRole,
  };
}

export function normalizeAuthRolesConfig(
  config?: AuthRolesConfig | null
): NormalizedAuthRolesConfig {
  if (!config) {
    return DEFAULT_AUTH_ROLES;
  }

  return {
    user: normalizeRoleScopeConfig(config.user, DEFAULT_AUTH_ROLES.user),
    organization: normalizeRoleScopeConfig(config.organization, DEFAULT_AUTH_ROLES.organization),
    team: normalizeRoleScopeConfig(config.team, DEFAULT_AUTH_ROLES.team),
  };
}

export function defineAuthRoles(config: AuthRolesConfig): NormalizedAuthRolesConfig {
  return normalizeAuthRolesConfig(config);
}

export function getRoleKeys(
  config: NormalizedAuthRolesConfig,
  scope: AuthRoleScope
): readonly string[] {
  return config[scope].roles;
}

export function isAllowedRole(
  config: NormalizedAuthRolesConfig,
  scope: AuthRoleScope,
  role: string
): boolean {
  return getRoleKeys(config, scope).includes(role);
}

export function createRoleValueSchema(scope: NormalizedAuthRoleScopeConfig) {
  const allowed = [...scope.roles];
  if (allowed.length === 0) {
    return z.string();
  }
  return z.enum(allowed as [string, ...string[]]);
}

export function getAppRoleTranslationKey(scope: AuthRoleScope, role: string): string {
  return `${scope}.role.${role}`;
}
