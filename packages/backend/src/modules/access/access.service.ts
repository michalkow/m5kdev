import type { Statements } from "better-auth/plugins/access";
import { err, ok } from "neverthrow";
import type { AccessRepository } from "#modules/access/access.repository";
import type { AccessControlRoles } from "#modules/access/access.utils";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";

type User = {
  id: string;
  role: string;
};

export class AccessService<T extends Statements> extends BaseService<
  { access: AccessRepository },
  never
> {
  acr: AccessControlRoles<T>;

  constructor(repositories: { access: AccessRepository }, acr: AccessControlRoles<T>) {
    super(repositories);
    this.acr = acr;
  }

  authorize(
    level: "user" | "team" | "organization",
    role: string,
    request: any,
    connector: "OR" | "AND" = "AND"
  ) {
    try {
      return !!this.acr[level][role].authorize(request, connector).success;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async checkAccess(
    user: User,
    level: "team" | "organization",
    levelId: string,
    request: any,
    connector: "OR" | "AND" = "AND"
  ): ServerResultAsync<boolean> {
    const role =
      level === "organization"
        ? await this.repository.access.getOrganizationRole(user.id, levelId)
        : await this.repository.access.getTeamRole(user.id, levelId);
    if (role.isErr()) return err(role.error);
    return ok(this.authorize(level, role.value, request, connector));
  }

  async hasAccess(
    user: User,
    level: "user" | "team" | "organization",
    levelId: string,
    request: any,
    connector: "OR" | "AND" = "AND"
  ): ServerResultAsync<boolean> {
    // FIXME: catch all admin user access for now
    if (user.role === "admin") return ok(true);
    const userAccess = this.authorize("user", user.role, request, connector);
    if (level === "user") return ok(userAccess && user.id === levelId);
    if (userAccess) return ok(true);

    const organizationAccess = await this.checkAccess(
      user,
      "organization",
      levelId,
      request,
      connector
    );
    if (organizationAccess.isErr()) return err(organizationAccess.error);
    if (level === "organization") return organizationAccess;
    if (organizationAccess.value) return ok(true);

    const teamAccess = await this.checkAccess(user, "team", levelId, request, connector);
    if (teamAccess.isErr()) return err(teamAccess.error);
    return teamAccess;
  }
}
