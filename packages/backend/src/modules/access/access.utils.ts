import {
  type AccessControl,
  createAccessControl,
  type Role,
  type Statements,
  type Subset,
} from "better-auth/plugins/access";

export type AccessControlRoles<T extends Statements> = {
  ac: AccessControl<T>;
  user: Record<string, Role<Subset<keyof T, T>>>;
  team: Record<string, Role<Subset<keyof T, T>>>;
  organization: Record<string, Role<Subset<keyof T, T>>>;
};

// Allow defining role statements with any subset of resources from T
// and only actions permitted by each resource definition in T
export type RoleDefinition<T extends Statements> = {
  [K in keyof T]?: T[K] extends readonly (infer A)[] ? readonly A[] : never;
};

export type RoleDefinitions<T extends Statements> = {
  user: Record<string, RoleDefinition<T>>;
  team: Record<string, RoleDefinition<T>>;
  organization: Record<string, RoleDefinition<T>>;
};

export function createAccessRoles<T extends Statements>(
  statements: T,
  roleDefinitions: RoleDefinitions<T>
): AccessControlRoles<T> {
  const ac = createAccessControl(statements);
  const user: Record<string, Role<Subset<keyof T, T>>> = {};
  const team: Record<string, Role<Subset<keyof T, T>>> = {};
  const organization: Record<string, Role<Subset<keyof T, T>>> = {};
  for (const [roleName, roleStatements] of Object.entries(roleDefinitions.user)) {
    user[roleName] = ac.newRole(roleStatements as unknown as Subset<keyof T, T>);
  }
  for (const [roleName, roleStatements] of Object.entries(roleDefinitions.team)) {
    team[roleName] = ac.newRole(roleStatements as unknown as Subset<keyof T, T>);
  }
  for (const [roleName, roleStatements] of Object.entries(roleDefinitions.organization)) {
    organization[roleName] = ac.newRole(roleStatements as unknown as Subset<keyof T, T>);
  }
  return { ac, user, team, organization };
}
