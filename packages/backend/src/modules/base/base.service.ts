import type { QueryFilter, QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import { err, ok } from "neverthrow";
import { Base } from "./base.abstract";
import { type AuthenticatedActor, validateActor } from "./base.actor";
import type { ServerResult, ServerResultAsync } from "./base.dto";
import {
  checkPermissionAsync,
  checkPermissionSync,
  type Entity,
  type ResourceActionGrant,
  type ResourceGrant,
} from "./base.grants";
import {
  createPermissionServiceProcedureBuilder,
  createServiceProcedureBuilder,
  type PermissionServiceProcedureBuilder,
  type ServiceProcedureBuilder,
  type ServiceProcedureContext,
} from "./base.procedure";

export type {
  PermissionServiceProcedureBuilder,
  ServiceProcedure,
  ServiceProcedureAccessConfig,
  ServiceProcedureAccessEntitiesConfig,
  ServiceProcedureAccessStateConfig,
  ServiceProcedureArgs,
  ServiceProcedureBuilder,
  ServiceProcedureContext,
  ServiceProcedureContextFilteredInput,
  ServiceProcedureContextFilterScope,
  ServiceProcedureEntityStepName,
  ServiceProcedureInputMapper,
} from "./base.procedure";

export class BaseService<
  Repositories extends Record<string, Base>,
  Services extends Record<string, Base>,
  DefaultContext extends ServiceProcedureContext = ServiceProcedureContext,
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
    query?: undefined,
    columnId?: string,
    method?: QueryFilter["method"]
  ): QueryInput;
  addUserFilter<TQuery extends QueryInput>(
    value: string,
    query: TQuery,
    columnId?: string,
    method?: QueryFilter["method"]
  ): TQuery;
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

  protected procedure<TInput, TCtx extends ServiceProcedureContext = DefaultContext>(
    name: string
  ): ServiceProcedureBuilder<TInput, TCtx, Repositories, Services> {
    return createServiceProcedureBuilder(this, { name, steps: [] });
  }

  addContextFilter(
    actor: AuthenticatedActor,
    include?: { user?: boolean; organization?: boolean; team?: boolean },
    query?: undefined,
    map?: Record<string, { columnId: string; method: QueryFilter["method"] }>
  ): QueryInput;
  addContextFilter<TQuery extends QueryInput>(
    actor: AuthenticatedActor,
    include: { user?: boolean; organization?: boolean; team?: boolean } | undefined,
    query: TQuery,
    map?: Record<string, { columnId: string; method: QueryFilter["method"] }>
  ): TQuery;
  addContextFilter(
    actor: AuthenticatedActor,
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
        value: actor.userId,
      });
    }
    if (include.organization) {
      if (!validateActor(actor, "organization")) {
        throw new Error("Organization-scoped context filter requires an organization actor");
      }
      filters.push({
        columnId: map.organizationId.columnId,
        type: "string",
        method: map.organizationId.method,
        value: actor.organizationId!,
      });
    }
    if (include.team) {
      if (!validateActor(actor, "team")) {
        throw new Error("Team-scoped context filter requires a team actor");
      }
      filters.push({
        columnId: map.teamId.columnId,
        type: "string",
        method: map.teamId.method,
        value: actor.teamId!,
      });
    }
    return query ? { ...query, filters: [...(query?.filters ?? []), ...filters] } : { filters };
  }
}

export class BasePermissionService<
  Repositories extends Record<string, Base>,
  Services extends Record<string, Base>,
  DefaultContext extends ServiceProcedureContext = ServiceProcedureContext,
> extends BaseService<Repositories, Services, DefaultContext> {
  grants: ResourceGrant[];
  constructor(repository: Repositories, service: Services, grants: ResourceGrant[] = []) {
    super(repository, service);
    this.grants = grants;
  }

  accessGuard<T extends Entity>(
    actor: AuthenticatedActor,
    action: string,
    entities?: T | T[],
    grants?: ResourceActionGrant[]
  ): ServerResult<true> {
    const hasPermission = this.checkPermission(actor, action, entities, grants);
    if (!hasPermission) return this.error("FORBIDDEN");
    return ok(true);
  }

  async accessGuardAsync<T extends Entity>(
    actor: AuthenticatedActor,
    action: string,
    getEntities: () => ServerResultAsync<T | T[] | undefined>,
    grants?: ResourceActionGrant[]
  ): ServerResultAsync<true> {
    const hasPermission = await this.checkPermissionAsync(actor, action, getEntities, grants);
    if (hasPermission.isErr()) return err(hasPermission.error);
    if (!hasPermission.value) return this.error("FORBIDDEN");
    return ok(true);
  }

  protected override procedure<TInput, TCtx extends ServiceProcedureContext = DefaultContext>(
    name: string
  ): PermissionServiceProcedureBuilder<TInput, TCtx, Repositories, Services> {
    return createPermissionServiceProcedureBuilder(this, { name, steps: [] });
  }

  checkPermission<T extends Entity>(
    actor: AuthenticatedActor,
    action: string,
    entities?: T | T[],
    grants?: ResourceActionGrant[]
  ): boolean {
    const actionGrants = grants ?? this.grants.filter((grant) => grant.action === action);
    return checkPermissionSync(actor, actionGrants, entities);
  }

  async checkPermissionAsync<T extends Entity>(
    actor: AuthenticatedActor,
    action: string,
    getEntities: () => ServerResultAsync<T | T[] | undefined>,
    grants?: ResourceActionGrant[]
  ): ServerResultAsync<boolean> {
    const actionGrants = grants ?? this.grants.filter((grant) => grant.action === action);
    const permission = await checkPermissionAsync(actor, actionGrants, getEntities);
    if (permission.isErr())
      return this.error("INTERNAL_SERVER_ERROR", "Failed to check permission", {
        cause: permission.error,
      });
    return ok(permission.value);
  }
}
