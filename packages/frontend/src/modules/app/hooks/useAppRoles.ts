import {
  normalizeAuthRolesConfig,
  type AuthRoleScope,
  type NormalizedAuthRoleScopeConfig,
  type NormalizedAuthRolesConfig,
} from "@m5kdev/commons/modules/auth/auth.roles";
import { useMemo } from "react";
import { useAppConfig } from "./useAppConfig";

export function useAppRoles(): NormalizedAuthRolesConfig;
export function useAppRoles(scope: AuthRoleScope): NormalizedAuthRoleScopeConfig;
export function useAppRoles(
  scope?: AuthRoleScope
): NormalizedAuthRolesConfig | NormalizedAuthRoleScopeConfig {
  const { roles } = useAppConfig();
  const normalizedRoles = useMemo(() => normalizeAuthRolesConfig(roles), [roles]);

  if (scope) {
    return normalizedRoles[scope];
  }

  return normalizedRoles;
}
