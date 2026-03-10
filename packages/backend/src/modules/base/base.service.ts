import type { QueryFilter, QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import { err, ok } from "neverthrow";
import type { Context, Session, User } from "#modules/auth/auth.lib";
import { Base } from "#modules/base/base.abstract";
import type { ServerResult, ServerResultAsync } from "#modules/base/base.dto";
import {
  checkPermissionAsync,
  checkPermissionSync,
  type Entity,
  type ResourceActionGrant,
  type ResourceGrant,
} from "#modules/base/base.grants";
import type { BaseExternaRepository, BaseRepository } from "#modules/base/base.repository";

export class BaseService<
  Repositories extends Record<string, BaseRepository<any, any, any> | BaseExternaRepository>,
  Services extends Record<string, BaseService<any, any>>,
> extends Base {
  constructor(
    public repository: Repositories = {} as Repositories,
    public service: Services = {} as Services
  ) {
    super("service");
    this.repository = repository;
    this.service = service;
  }

  addUserFilter(
    value: string,
    query?: QueryInput,
    columnId = "userId",
    method: QueryFilter["method"] = "equals"
  ): QueryInput {
    const userFilter: QueryFilter = {
      columnId,
      type: "string",
      method,
      value,
    };
    return query
      ? { ...query, filters: [...(query?.filters ?? []), userFilter] }
      : { filters: [userFilter] };
  }

  addContextFilter(
    ctx: Context,
    include: { user?: boolean; organization?: boolean; team?: boolean } = {
      user: true,
      organization: false,
      team: false,
    },
    query?: QueryInput,
    map: Record<string, { columnId: string; method: QueryFilter["method"] }> = {
      userId: {
        columnId: "userId",
        method: "equals",
      },
      organizationId: {
        columnId: "organizationId",
        method: "equals",
      },
      teamId: {
        columnId: "teamId",
        method: "equals",
      },
    }
  ): QueryInput {
    const filters: QueryFilter[] = [];
    if (include.user) {
      filters.push({
        columnId: map.userId.columnId,
        type: "string",
        method: map.userId.method,
        value: ctx.user.id,
      });
    }
    if (include.organization) {
      filters.push({
        columnId: map.organizationId.columnId,
        type: "string",
        method: map.organizationId.method,
        value: ctx.session.activeOrganizationId ?? "",
      });
    }
    if (include.team) {
      filters.push({
        columnId: map.teamId.columnId,
        type: "string",
        method: map.teamId.method,
        value: ctx.session.activeTeamId ?? "",
      });
    }
    return query ? { ...query, filters: [...(query?.filters ?? []), ...filters] } : { filters };
  }
}

export class BasePermissionService<
  Repositories extends Record<string, BaseRepository<any, any, any> | BaseExternaRepository>,
  Services extends Record<string, BaseService<any, any>>,
> extends BaseService<Repositories, Services> {
  grants: ResourceGrant[];
  constructor(repository: Repositories, service: Services, grants: ResourceGrant[] = []) {
    super(repository, service);
    this.grants = grants;
  }

  accessGuard<T extends Entity>(
    ctx: { session: Session; user: User },
    action: string,
    entities?: T | T[],
    grants?: ResourceActionGrant[]
  ): ServerResult<true> {
    const hasPermission = this.checkPermission(ctx, action, entities, grants);
    if (!hasPermission) return this.error("FORBIDDEN");
    return ok(true);
  }

  async accessGuardAsync<T extends Entity>(
    ctx: { session: Session; user: User },
    action: string,
    getEntities: () => ServerResultAsync<T | T[] | undefined>,
    grants?: ResourceActionGrant[]
  ): ServerResultAsync<true> {
    const hasPermission = await this.checkPermissionAsync(ctx, action, getEntities, grants);
    if (hasPermission.isErr()) return err(hasPermission.error);
    if (!hasPermission.value) return this.error("FORBIDDEN");
    return ok(true);
  }

  checkPermission<T extends Entity>(
    ctx: { session: Session; user: User },
    action: string,
    entities?: T | T[],
    grants?: ResourceActionGrant[]
  ): boolean {
    const actionGrants = grants ?? this.grants.filter((grant) => grant.action === action);
    return checkPermissionSync(ctx, actionGrants, entities);
  }

  async checkPermissionAsync<T extends Entity>(
    ctx: { session: Session; user: User },
    action: string,
    getEntities: () => ServerResultAsync<T | T[] | undefined>,
    grants?: ResourceActionGrant[]
  ): ServerResultAsync<boolean> {
    const actionGrants = grants ?? this.grants.filter((grant) => grant.action === action);
    const permission = await checkPermissionAsync(ctx, actionGrants, getEntities);
    if (permission.isErr())
      return this.error("INTERNAL_SERVER_ERROR", "Failed to check permission", {
        cause: permission.error,
      });
    return ok(permission.value);
  }
}
