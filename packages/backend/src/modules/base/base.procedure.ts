import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { ok } from "neverthrow";
import type { z } from "zod";
import type { ServerError } from "../../utils/errors";
import type { logger } from "../../utils/logger";
import { serializeSpanValue, withSpan } from "../../utils/telemetry";
import type { Base } from "./base.abstract";
import { type Actor, type ActorScope, type AuthenticatedActor, validateActor } from "./base.actor";
import type { ServerResult, ServerResultAsync } from "./base.dto";
import type { Entity, PermissionCheckOptions, ResourceActionGrant } from "./base.grants";

type ServiceLogger = ReturnType<typeof logger.child>;
type RepositoryMap = Record<string, Base>;
type ServiceMap = Record<string, Base>;

export type ServiceProcedureContext = {
  actor?: AuthenticatedActor | null;
} & Record<string, unknown>;

export type ServiceProcedureState = Record<string, unknown>;
export type ServiceProcedureStoredValue<T> = [T] extends [undefined] ? undefined : Awaited<T>;
/** Value stored in procedure state after `loadResource` (loader may return null/undefined; state is narrowed). */
export type ServiceProcedureLoadedResource<TOutput> = NonNullable<
  ServiceProcedureStoredValue<TOutput>
>;
export type ServiceProcedureResultLike<T> = T | ServerResult<T> | Promise<T | ServerResult<T>>;
export type ServiceProcedureContextFilterScope = ActorScope;
export type ServiceProcedureContextFilteredInput<TInput> = Extract<NonNullable<TInput>, QueryInput>;
type ServiceProcedureAuthContext<
  Scope extends ActorScope,
  TCtx extends ServiceProcedureContext = ServiceProcedureContext,
> = {
  [K in keyof TCtx]-?: NonNullable<TCtx[K]>;
} & { actor: Actor[Scope] };
type ServiceProcedureRequiredScopeFromFilter<
  TInclude extends readonly ServiceProcedureContextFilterScope[] | undefined,
> = TInclude extends readonly ServiceProcedureContextFilterScope[]
  ? "team" extends TInclude[number]
    ? "team"
    : "organization" extends TInclude[number]
      ? "organization"
      : "user"
  : "user";

export type ServiceProcedure<TInput, TCtx extends ServiceProcedureContext, TOutput> = (
  input: TInput,
  ctx: TCtx
) => ServerResultAsync<TOutput>;

export type ServiceProcedureArgs<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
> = {
  input: TInput;
  ctx: TCtx;
  state: State;
  repository: Repositories;
  service: Services;
  logger: ServiceLogger;
};

export type ServiceProcedureStep<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TOutput = undefined,
> = (
  args: ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>
) => ServiceProcedureResultLike<ServiceProcedureStoredValue<TOutput>>;

export type ServiceProcedureInputMapper<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TNextInput,
> = (
  args: ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>
) => ServiceProcedureResultLike<ServiceProcedureStoredValue<TNextInput>>;

export type ServiceProcedureHandler<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TOutput,
> = (
  args: ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>
) => ServiceProcedureResultLike<TOutput>;

export type ServiceProcedureEntityResolver<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TEntities extends Entity | Entity[] | undefined,
> =
  | TEntities
  | ((
      args: ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>
    ) => ServiceProcedureResultLike<TEntities>);

type ServiceProcedureAccessBaseConfig = {
  action: string;
  grants?: ResourceActionGrant[];
  ownership?: boolean;
};

export type ServiceProcedureEntityStepName<State extends ServiceProcedureState> = Extract<
  {
    [Key in keyof State]: State[Key] extends Entity | Entity[] | undefined ? Key : never;
  }[keyof State],
  string
>;

export type ServiceProcedureAccessEntitiesConfig<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TEntities extends Entity | Entity[] | undefined = undefined,
> = ServiceProcedureAccessBaseConfig & {
  entities?: ServiceProcedureEntityResolver<TInput, TCtx, Repositories, Services, State, TEntities>;
  entityStep?: never;
};

export type ServiceProcedureAccessStateConfig<
  State extends ServiceProcedureState,
  StepName extends ServiceProcedureEntityStepName<State>,
> = ServiceProcedureAccessBaseConfig & {
  entityStep: StepName;
  entities?: never;
};

export type ServiceProcedureAccessConfig<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TEntities extends Entity | Entity[] | undefined = undefined,
> =
  | ServiceProcedureAccessEntitiesConfig<TInput, TCtx, Repositories, Services, State, TEntities>
  | ServiceProcedureAccessStateConfig<State, ServiceProcedureEntityStepName<State>>;

export interface ServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
  TExpectedOutput = void,
> {
  input<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): ServiceProcedureBuilder<
    z.infer<TSchema>,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  output<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State, z.infer<TSchema>>;
  use<StepName extends string, TOutput = void>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
  ): ServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TOutput>>,
    TExpectedOutput
  >;
  /**
   * Loads a value from a `ServerResult` (or plain value) and stores it under `stepName`.
   * Propagates `Err`; if the resolved value is falsy, returns `NOT_FOUND`.
   * For valid numeric `0` or empty string, use `.use()` instead of this helper.
   */
  loadResource<StepName extends string, TOutput>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>,
    options?: { notFoundMessage?: string }
  ): ServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureLoadedResource<TOutput>>,
    TExpectedOutput
  >;
  mapInput<StepName extends string, TNextInput>(
    stepName: StepName,
    step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
  ): ServiceProcedureBuilder<
    ServiceProcedureStoredValue<TNextInput>,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>,
    TExpectedOutput
  >;
  addContextFilter<
    TInclude extends readonly ServiceProcedureContextFilterScope[] | undefined = undefined,
  >(
    include?: TInclude
  ): ServiceProcedureBuilder<
    ServiceProcedureContextFilteredInput<TInput>,
    ServiceProcedureAuthContext<ServiceProcedureRequiredScopeFromFilter<TInclude>, TCtx>,
    Repositories,
    Services,
    State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> },
    TExpectedOutput
  >;
  requireAuth<Scope extends ActorScope = "user">(
    scope?: Scope
  ): ServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<Scope, TCtx>,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  // biome-ignore lint/suspicious/noConfusingVoidType: void is used as a sentinel for "no output schema declared"
  handle: [TExpectedOutput] extends [void]
    ? <TOutput>(
        handler: ServiceProcedureHandler<TInput, TCtx, Repositories, Services, State, TOutput>
      ) => ServiceProcedure<TInput, TCtx, TOutput>
    : (
        handler: ServiceProcedureHandler<
          TInput,
          TCtx,
          Repositories,
          Services,
          State,
          TExpectedOutput
        >
      ) => ServiceProcedure<TInput, TCtx, TExpectedOutput>;
}

export interface PermissionServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
  TExpectedOutput = void,
> extends ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State, TExpectedOutput> {
  input<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): PermissionServiceProcedureBuilder<
    z.infer<TSchema>,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  output<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    z.infer<TSchema>
  >;
  use<StepName extends string, TOutput = void>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
  ): PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TOutput>>,
    TExpectedOutput
  >;
  loadResource<StepName extends string, TOutput>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>,
    options?: { notFoundMessage?: string }
  ): PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureLoadedResource<TOutput>>,
    TExpectedOutput
  >;
  mapInput<StepName extends string, TNextInput>(
    stepName: StepName,
    step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
  ): PermissionServiceProcedureBuilder<
    ServiceProcedureStoredValue<TNextInput>,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>,
    TExpectedOutput
  >;
  addContextFilter<
    TInclude extends readonly ServiceProcedureContextFilterScope[] | undefined = undefined,
  >(
    include?: TInclude
  ): PermissionServiceProcedureBuilder<
    ServiceProcedureContextFilteredInput<TInput>,
    ServiceProcedureAuthContext<ServiceProcedureRequiredScopeFromFilter<TInclude>, TCtx>,
    Repositories,
    Services,
    State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> },
    TExpectedOutput
  >;
  requireAuth<Scope extends ActorScope = "user">(
    scope?: Scope
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<Scope, TCtx>,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  access(
    config: ServiceProcedureAccessEntitiesConfig<TInput, TCtx, Repositories, Services, State>
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<"user", TCtx>,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  access<TEntities extends Entity | Entity[] | undefined>(
    config: ServiceProcedureAccessEntitiesConfig<
      TInput,
      TCtx,
      Repositories,
      Services,
      State,
      TEntities
    >
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<"user", TCtx>,
    Repositories,
    Services,
    State & { access: TEntities },
    TExpectedOutput
  >;
  access<StepName extends ServiceProcedureEntityStepName<State>>(
    config: ServiceProcedureAccessStateConfig<State, StepName>
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<"user", TCtx>,
    Repositories,
    Services,
    State & { access: State[StepName] },
    TExpectedOutput
  >;
}

type BaseServiceProcedureHost<Repositories extends RepositoryMap, Services extends ServiceMap> = {
  repository: Repositories;
  service: Services;
  logger: ServiceLogger;
  layerName: string;
  addContextFilter(
    actor: AuthenticatedActor,
    include?: { user?: boolean; organization?: boolean; team?: boolean },
    query?: QueryInput
  ): QueryInput;
  error(
    code: TRPC_ERROR_CODE_KEY,
    message?: string,
    options?: {
      cause?: unknown;
      clientMessage?: string;
      context?: Record<string, unknown>;
      log?: boolean;
    }
  ): ServerResult<never>;
  throwableAsync<T>(fn: () => ServerResultAsync<T>): ServerResultAsync<T>;
  handleUnknownError(error: unknown): ServerError;
};

type PermissionServiceProcedureHost<
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
> = BaseServiceProcedureHost<Repositories, Services> & {
  checkPermission<T extends Entity>(
    actor: AuthenticatedActor,
    action: string,
    entities?: T | T[],
    grants?: ResourceActionGrant[],
    options?: PermissionCheckOptions
  ): boolean;
  checkPermissionAsync<T extends Entity>(
    actor: AuthenticatedActor,
    action: string,
    getEntities: () => ServerResultAsync<T | T[] | undefined>,
    grants?: ResourceActionGrant[],
    options?: PermissionCheckOptions
  ): ServerResultAsync<boolean>;
};

type ProcedureStage = "start" | "auth_passed" | "access_passed" | "forbidden" | "success" | "error";

type ProcedureRuntimeStep<Repositories extends RepositoryMap, Services extends ServiceMap> = {
  stage: "use" | "input" | "auth" | "access";
  stepName: string;
  run: (
    args: ServiceProcedureArgs<
      unknown,
      ServiceProcedureContext,
      Repositories,
      Services,
      ServiceProcedureState
    >
  ) => Promise<ServerResult<unknown>>;
};

type ProcedureBuilderConfig<Repositories extends RepositoryMap, Services extends ServiceMap> = {
  name: string;
  steps: ProcedureRuntimeStep<Repositories, Services>[];
  outputSchema?: z.ZodType;
};

const DEFAULT_CONTEXT_FILTER_INCLUDE = [
  "user",
] as const satisfies readonly ServiceProcedureContextFilterScope[];

function isServerResult<T>(value: unknown): value is ServerResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "isErr" in value &&
    typeof (value as { isErr: unknown }).isErr === "function" &&
    "isOk" in value &&
    typeof (value as { isOk: unknown }).isOk === "function"
  );
}

async function normalizeProcedureResult<T>(
  result: ServiceProcedureResultLike<T>
): Promise<ServerResult<T>> {
  const resolved = await result;
  return isServerResult<T>(resolved) ? resolved : ok(resolved);
}

function addProcedureContext<T>(result: ServerResult<T>, procedure: string): ServerResult<T> {
  if (result.isErr()) {
    result.error.addContext({ procedure });
  }
  return result;
}

function assertUniqueStepName<Repositories extends RepositoryMap, Services extends ServiceMap>(
  steps: ProcedureRuntimeStep<Repositories, Services>[],
  stepName: string
) {
  if (steps.some((step) => step.stepName === stepName)) {
    throw new Error(`Duplicate service procedure step name: ${stepName}`);
  }
}

function hasStepName<Repositories extends RepositoryMap, Services extends ServiceMap>(
  steps: ProcedureRuntimeStep<Repositories, Services>[],
  stepName: string
) {
  return steps.some((step) => step.stepName === stepName);
}

function getContextFilterInclude(
  include: readonly ServiceProcedureContextFilterScope[] = DEFAULT_CONTEXT_FILTER_INCLUDE
) {
  return {
    user: include.includes("user"),
    organization: include.includes("organization"),
    team: include.includes("team"),
  };
}

function getFailureStage(code: TRPC_ERROR_CODE_KEY | undefined): ProcedureStage {
  return code === "FORBIDDEN" || code === "UNAUTHORIZED" ? "forbidden" : "error";
}

function logProcedureStage<Repositories extends RepositoryMap, Services extends ServiceMap>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  procedureName: string,
  ctx: ServiceProcedureContext,
  stage: ProcedureStage,
  {
    stepName,
    durationMs,
    errorCode,
  }: {
    stepName?: string;
    durationMs?: number;
    errorCode?: TRPC_ERROR_CODE_KEY;
  } = {}
) {
  host.logger.debug({
    procedureName,
    stage,
    stepName,
    durationMs,
    errorCode,
    hasActor: Boolean(ctx.actor),
  });
}

function requireProcedureActor<
  Scope extends ActorScope,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  ctx: ServiceProcedureContext,
  scope: Scope
): ServerResult<Actor[Scope]> {
  if (!ctx.actor) {
    return host.error("UNAUTHORIZED", "Unauthorized");
  }

  if (!validateActor(ctx.actor, scope)) {
    return host.error("FORBIDDEN", "Forbidden");
  }

  return ok(ctx.actor as Actor[Scope]);
}

function createRequireAuthStep<Repositories extends RepositoryMap, Services extends ServiceMap>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  scope: ActorScope = "user"
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "auth",
    stepName: "auth",
    run: async ({ ctx }) => {
      return requireProcedureActor(host, ctx, scope);
    },
  };
}

function createUseStep<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TOutput,
>(
  stepName: string,
  step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "use",
    stepName,
    run: async (args) =>
      normalizeProcedureResult(
        step(args as ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>)
      ),
  };
}

const DEFAULT_LOAD_RESOURCE_NOT_FOUND_MESSAGE = "Resource not found";

function createLoadResourceStep<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TOutput,
>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  stepName: string,
  step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>,
  notFoundMessage: string
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "use",
    stepName,
    run: async (args) => {
      const normalized = await normalizeProcedureResult(
        step(args as ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>)
      );
      if (normalized.isErr()) {
        return normalized;
      }
      const value = normalized.value;
      if (!value) {
        return host.error("NOT_FOUND", notFoundMessage);
      }
      return ok(value as ServiceProcedureLoadedResource<TOutput>);
    },
  };
}

function createInputStep<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TNextInput,
>(
  stepName: string,
  step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "input",
    stepName,
    run: async (args) =>
      normalizeProcedureResult(
        step(args as ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>)
      ),
  };
}

function createContextFilterStep<Repositories extends RepositoryMap, Services extends ServiceMap>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  include?: readonly ServiceProcedureContextFilterScope[]
): ProcedureRuntimeStep<Repositories, Services> {
  const contextInclude = getContextFilterInclude(include);
  const requiredScope: ActorScope = contextInclude.team
    ? "team"
    : contextInclude.organization
      ? "organization"
      : "user";

  return {
    stage: "input",
    stepName: "contextFilter",
    run: async ({ input, ctx }) => {
      const actor = requireProcedureActor(host, ctx, requiredScope);
      if (actor.isErr()) return actor;
      return ok(host.addContextFilter(actor.value, contextInclude, input as QueryInput));
    },
  };
}

function createInputValidationStep<Repositories extends RepositoryMap, Services extends ServiceMap>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  schema: z.ZodType
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "input",
    stepName: "inputValidation",
    run: async ({ input }) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return host.error("BAD_REQUEST", parsed.error.message);
      }
      return ok(parsed.data);
    },
  };
}

function createAccessStep<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TEntities extends Entity | Entity[] | undefined,
>(
  host: PermissionServiceProcedureHost<Repositories, Services>,
  config: ServiceProcedureAccessConfig<TInput, TCtx, Repositories, Services, State, TEntities>
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "access",
    stepName: "access",
    run: async (args) => {
      const typedArgs = args as ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>;
      const actor = requireProcedureActor(host, typedArgs.ctx, "user");
      if (actor.isErr()) return actor;
      const permissionOptions: PermissionCheckOptions = config.ownership ? { ownership: true } : {};

      if ("entityStep" in config && typeof config.entityStep === "string") {
        const entities = typedArgs.state[config.entityStep] as TEntities;
        const hasPermission = host.checkPermission(
          actor.value,
          config.action,
          entities as Entity | Entity[] | undefined,
          config.grants,
          permissionOptions
        );

        if (!hasPermission) {
          return host.error("FORBIDDEN");
        }

        return ok(entities);
      }

      if (typeof config.entities === "function") {
        const resolveEntities = config.entities as (
          args: ServiceProcedureArgs<TInput, TCtx, Repositories, Services, State>
        ) => ServiceProcedureResultLike<TEntities>;

        let loadedEntities: TEntities | undefined;
        const permission = await host.checkPermissionAsync(
          actor.value,
          config.action,
          async () => {
            const entityResult = await normalizeProcedureResult(resolveEntities(typedArgs));
            if (entityResult.isOk()) {
              loadedEntities = entityResult.value;
            }
            return entityResult;
          },
          config.grants,
          permissionOptions
        );

        if (permission.isErr()) {
          return permission;
        }

        if (!permission.value) {
          return host.error("FORBIDDEN");
        }

        return ok(loadedEntities);
      }

      const entities = config.entities;
      const hasPermission = host.checkPermission(
        actor.value,
        config.action,
        entities,
        config.grants,
        permissionOptions
      );

      if (!hasPermission) {
        return host.error("FORBIDDEN");
      }

      return ok(entities);
    },
  };
}

function createProcedureHandler<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState,
  TOutput,
>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  config: ProcedureBuilderConfig<Repositories, Services>,
  handler: ServiceProcedureHandler<TInput, TCtx, Repositories, Services, State, TOutput>
): ServiceProcedure<TInput, TCtx, TOutput> {
  return async (input, ctx) =>
    withSpan(
      {
        name: `service.${host.layerName}.${config.name}`,
        attributes: { input: serializeSpanValue(input) },
      },
      () =>
        host.throwableAsync(async () => {
          const state: ServiceProcedureState = {};
          const startTime = Date.now();
          const typedCtx = ctx as ServiceProcedureContext;
          let currentInput: unknown = input;

          logProcedureStage(host, config.name, typedCtx, "start");

          try {
            for (const step of config.steps) {
              const stepResult = await withSpan(
                {
                  name: `${config.name}.${step.stepName}`,
                  attributes: { input: serializeSpanValue(currentInput) },
                },
                () =>
                  step.run({
                    input: currentInput,
                    ctx: typedCtx,
                    state,
                    repository: host.repository,
                    service: host.service,
                    logger: host.logger,
                  })
              );

              if (stepResult.isErr()) {
                addProcedureContext(stepResult, config.name);
                logProcedureStage(
                  host,
                  config.name,
                  typedCtx,
                  getFailureStage(stepResult.error.code),
                  {
                    stepName: step.stepName,
                    durationMs: Date.now() - startTime,
                    errorCode: stepResult.error.code,
                  }
                );
                return stepResult as ServerResult<TOutput>;
              }

              state[step.stepName] = stepResult.value;

              if (step.stage === "input") {
                currentInput = stepResult.value;
              }

              if (step.stage === "auth") {
                logProcedureStage(host, config.name, typedCtx, "auth_passed", {
                  stepName: step.stepName,
                });
              }

              if (step.stage === "access") {
                logProcedureStage(host, config.name, typedCtx, "access_passed", {
                  stepName: step.stepName,
                });
              }
            }

            const handlerResult = await withSpan(
              {
                name: `${config.name}.handle`,
                attributes: { input: serializeSpanValue(currentInput) },
              },
              () =>
                normalizeProcedureResult(
                  handler({
                    input: currentInput as TInput,
                    ctx: ctx as TCtx,
                    state: state as State,
                    repository: host.repository,
                    service: host.service,
                    logger: host.logger,
                  })
                )
            );

            if (handlerResult.isErr()) {
              addProcedureContext(handlerResult, config.name);
              logProcedureStage(
                host,
                config.name,
                typedCtx,
                getFailureStage(handlerResult.error.code),
                {
                  durationMs: Date.now() - startTime,
                  errorCode: handlerResult.error.code,
                }
              );
              return handlerResult;
            }

            if (config.outputSchema) {
              const parsed = config.outputSchema.safeParse(handlerResult.value);
              if (!parsed.success) {
                return addProcedureContext(
                  host.error("INTERNAL_SERVER_ERROR", parsed.error.message),
                  config.name
                );
              }
              logProcedureStage(host, config.name, typedCtx, "success", {
                durationMs: Date.now() - startTime,
              });
              return ok(parsed.data as TOutput);
            }

            logProcedureStage(host, config.name, typedCtx, "success", {
              durationMs: Date.now() - startTime,
            });
            return handlerResult;
          } catch (error) {
            const serverError = host.handleUnknownError(error);
            logProcedureStage(host, config.name, typedCtx, getFailureStage(serverError.code), {
              durationMs: Date.now() - startTime,
              errorCode: serverError.code,
            });
            throw error;
          }
        })
    );
}

export function createServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
  TExpectedOutput = void,
>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  config: ProcedureBuilderConfig<Repositories, Services>
): ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State, TExpectedOutput> {
  function addContextFilter<
    TInclude extends readonly ServiceProcedureContextFilterScope[] | undefined = undefined,
  >(include?: TInclude) {
    const steps = hasStepName(config.steps, "auth")
      ? config.steps
      : [...config.steps, createRequireAuthStep(host, "user")];

    assertUniqueStepName(steps, "contextFilter");

    return createServiceProcedureBuilder<
      ServiceProcedureContextFilteredInput<TInput>,
      ServiceProcedureAuthContext<ServiceProcedureRequiredScopeFromFilter<TInclude>, TCtx>,
      Repositories,
      Services,
      State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> },
      TExpectedOutput
    >(host, {
      ...config,
      steps: [...steps, createContextFilterStep(host, include)],
    });
  }

  const builder: ServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  > = {
    input(schema, validate) {
      const nextConfig = validate
        ? { ...config, steps: [...config.steps, createInputValidationStep(host, schema)] }
        : config;
      return createServiceProcedureBuilder(host, nextConfig);
    },
    output(schema, validate) {
      const nextConfig = validate ? { ...config, outputSchema: schema } : config;
      return createServiceProcedureBuilder(host, nextConfig);
    },
    use<StepName extends string, TOutput = void>(
      stepName: StepName,
      step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
    ) {
      assertUniqueStepName(config.steps, stepName);
      return createServiceProcedureBuilder<
        TInput,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureStoredValue<TOutput>>,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createUseStep(stepName, step)],
      });
    },
    loadResource<StepName extends string, TOutput>(
      stepName: StepName,
      step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>,
      options?: { notFoundMessage?: string }
    ) {
      assertUniqueStepName(config.steps, stepName);
      const notFoundMessage = options?.notFoundMessage ?? DEFAULT_LOAD_RESOURCE_NOT_FOUND_MESSAGE;
      return createServiceProcedureBuilder<
        TInput,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureLoadedResource<TOutput>>,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createLoadResourceStep(host, stepName, step, notFoundMessage)],
      });
    },
    mapInput<StepName extends string, TNextInput>(
      stepName: StepName,
      step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
    ) {
      assertUniqueStepName(config.steps, stepName);
      return createServiceProcedureBuilder<
        ServiceProcedureStoredValue<TNextInput>,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createInputStep(stepName, step)],
      });
    },
    addContextFilter,
    requireAuth<Scope extends ActorScope = "user">(scope?: Scope) {
      assertUniqueStepName(config.steps, "auth");
      return createServiceProcedureBuilder<
        TInput,
        ServiceProcedureAuthContext<Scope, TCtx>,
        Repositories,
        Services,
        State,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createRequireAuthStep(host, scope ?? "user")],
      });
    },
    // biome-ignore lint/suspicious/noExplicitAny: conditional handle type requires untyped implementation
    handle(handler: any) {
      return createProcedureHandler(host, config, handler);
    },
  } as ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State, TExpectedOutput>;

  return builder;
}

export function createPermissionServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
  TExpectedOutput = void,
>(
  host: PermissionServiceProcedureHost<Repositories, Services>,
  config: ProcedureBuilderConfig<Repositories, Services>
): PermissionServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State, TExpectedOutput> {
  function addContextFilter<
    TInclude extends readonly ServiceProcedureContextFilterScope[] | undefined = undefined,
  >(include?: TInclude) {
    const steps = hasStepName(config.steps, "auth")
      ? config.steps
      : [...config.steps, createRequireAuthStep(host, "user")];

    assertUniqueStepName(steps, "contextFilter");

    return createPermissionServiceProcedureBuilder<
      ServiceProcedureContextFilteredInput<TInput>,
      ServiceProcedureAuthContext<ServiceProcedureRequiredScopeFromFilter<TInclude>, TCtx>,
      Repositories,
      Services,
      State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> },
      TExpectedOutput
    >(host, {
      ...config,
      steps: [...steps, createContextFilterStep(host, include)],
    });
  }

  function access(
    accessConfig: ServiceProcedureAccessEntitiesConfig<TInput, TCtx, Repositories, Services, State>
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<"user", TCtx>,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  function access<TEntities extends Entity | Entity[] | undefined>(
    accessConfig: ServiceProcedureAccessEntitiesConfig<
      TInput,
      TCtx,
      Repositories,
      Services,
      State,
      TEntities
    >
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<"user", TCtx>,
    Repositories,
    Services,
    State & { access: TEntities },
    TExpectedOutput
  >;
  function access<StepName extends ServiceProcedureEntityStepName<State>>(
    accessConfig: ServiceProcedureAccessStateConfig<State, StepName>
  ): PermissionServiceProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<"user", TCtx>,
    Repositories,
    Services,
    State & { access: State[StepName] },
    TExpectedOutput
  >;
  function access(
    accessConfig:
      | ServiceProcedureAccessEntitiesConfig<
          TInput,
          TCtx,
          Repositories,
          Services,
          State,
          Entity | Entity[] | undefined
        >
      | ServiceProcedureAccessStateConfig<State, ServiceProcedureEntityStepName<State>>
  ) {
    assertUniqueStepName(config.steps, "access");
    return createPermissionServiceProcedureBuilder<
      TInput,
      ServiceProcedureAuthContext<"user", TCtx>,
      Repositories,
      Services,
      State,
      TExpectedOutput
    >(host, {
      ...config,
      steps: [...config.steps, createAccessStep(host, accessConfig)],
    });
  }

  const builder: PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  > = {
    input(schema, validate) {
      const nextConfig = validate
        ? { ...config, steps: [...config.steps, createInputValidationStep(host, schema)] }
        : config;
      return createPermissionServiceProcedureBuilder(host, nextConfig);
    },
    output(schema, validate) {
      const nextConfig = validate ? { ...config, outputSchema: schema } : config;
      return createPermissionServiceProcedureBuilder(host, nextConfig);
    },
    use<StepName extends string, TOutput = void>(
      stepName: StepName,
      step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
    ) {
      assertUniqueStepName(config.steps, stepName);
      return createPermissionServiceProcedureBuilder<
        TInput,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureStoredValue<TOutput>>,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createUseStep(stepName, step)],
      });
    },
    loadResource<StepName extends string, TOutput>(
      stepName: StepName,
      step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>,
      options?: { notFoundMessage?: string }
    ) {
      assertUniqueStepName(config.steps, stepName);
      const notFoundMessage = options?.notFoundMessage ?? DEFAULT_LOAD_RESOURCE_NOT_FOUND_MESSAGE;
      return createPermissionServiceProcedureBuilder<
        TInput,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureLoadedResource<TOutput>>,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createLoadResourceStep(host, stepName, step, notFoundMessage)],
      });
    },
    mapInput<StepName extends string, TNextInput>(
      stepName: StepName,
      step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
    ) {
      assertUniqueStepName(config.steps, stepName);
      return createPermissionServiceProcedureBuilder<
        ServiceProcedureStoredValue<TNextInput>,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createInputStep(stepName, step)],
      });
    },
    addContextFilter,
    requireAuth<Scope extends ActorScope = "user">(scope?: Scope) {
      assertUniqueStepName(config.steps, "auth");
      return createPermissionServiceProcedureBuilder<
        TInput,
        ServiceProcedureAuthContext<Scope, TCtx>,
        Repositories,
        Services,
        State,
        TExpectedOutput
      >(host, {
        ...config,
        steps: [...config.steps, createRequireAuthStep(host, scope ?? "user")],
      });
    },
    access,
    // biome-ignore lint/suspicious/noExplicitAny: conditional handle type requires untyped implementation
    handle(handler: any) {
      return createProcedureHandler(host, config, handler);
    },
  } as PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;

  return builder;
}
