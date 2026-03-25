import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { ok } from "neverthrow";
import type { ServerError } from "../../utils/errors";
import type { logger } from "../../utils/logger";
import type { Context, Session, User } from "../auth/auth.lib";
import type { Base } from "./base.abstract";
import type { ServerResult, ServerResultAsync } from "./base.dto";
import type { Entity, ResourceActionGrant } from "./base.grants";

type ServiceLogger = ReturnType<typeof logger.child>;
type RepositoryMap = Record<string, Base>;
type ServiceMap = Record<string, Base>;

export type ServiceProcedureContext = {
  user?: User | null;
  session?: Session | null;
} & Record<string, unknown>;

export type ServiceProcedureState = Record<string, unknown>;
export type ServiceProcedureStoredValue<T> = [T] extends [undefined] ? undefined : Awaited<T>;
export type ServiceProcedureResultLike<T> = T | ServerResult<T> | Promise<T | ServerResult<T>>;
export type ServiceProcedureContextFilterScope = "user" | "organization" | "team";
export type ServiceProcedureContextFilteredInput<TInput> = Extract<NonNullable<TInput>, QueryInput>;

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
> {
  use<StepName extends string, TOutput = void>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
  ): ServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TOutput>>
  >;
  mapInput<StepName extends string, TNextInput>(
    stepName: StepName,
    step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
  ): ServiceProcedureBuilder<
    ServiceProcedureStoredValue<TNextInput>,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>
  >;
  addContextFilter(
    include?: readonly ServiceProcedureContextFilterScope[]
  ): ServiceProcedureBuilder<
    ServiceProcedureContextFilteredInput<TInput>,
    TCtx & Context,
    Repositories,
    Services,
    State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> }
  >;
  requireAuth(): ServiceProcedureBuilder<TInput, TCtx & Context, Repositories, Services, State>;
  handle<TOutput>(
    handler: ServiceProcedureHandler<TInput, TCtx, Repositories, Services, State, TOutput>
  ): ServiceProcedure<TInput, TCtx, TOutput>;
}

export interface PermissionServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
> extends ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State> {
  use<StepName extends string, TOutput = void>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
  ): PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TOutput>>
  >;
  mapInput<StepName extends string, TNextInput>(
    stepName: StepName,
    step: ServiceProcedureInputMapper<TInput, TCtx, Repositories, Services, State, TNextInput>
  ): PermissionServiceProcedureBuilder<
    ServiceProcedureStoredValue<TNextInput>,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>
  >;
  addContextFilter(
    include?: readonly ServiceProcedureContextFilterScope[]
  ): PermissionServiceProcedureBuilder<
    ServiceProcedureContextFilteredInput<TInput>,
    TCtx & Context,
    Repositories,
    Services,
    State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> }
  >;
  requireAuth(): PermissionServiceProcedureBuilder<
    TInput,
    TCtx & Context,
    Repositories,
    Services,
    State
  >;
  access(
    config: ServiceProcedureAccessEntitiesConfig<TInput, TCtx, Repositories, Services, State>
  ): PermissionServiceProcedureBuilder<TInput, TCtx & Context, Repositories, Services, State>;
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
    TCtx & Context,
    Repositories,
    Services,
    State & { access: TEntities }
  >;
  access<StepName extends ServiceProcedureEntityStepName<State>>(
    config: ServiceProcedureAccessStateConfig<State, StepName>
  ): PermissionServiceProcedureBuilder<
    TInput,
    TCtx & Context,
    Repositories,
    Services,
    State & { access: State[StepName] }
  >;
}

type BaseServiceProcedureHost<Repositories extends RepositoryMap, Services extends ServiceMap> = {
  repository: Repositories;
  service: Services;
  logger: ServiceLogger;
  addContextFilter(
    ctx: Context,
    include?: { user?: boolean; organization?: boolean; team?: boolean },
    query?: QueryInput
  ): QueryInput;
  error(
    code: TRPC_ERROR_CODE_KEY,
    message?: string,
    options?: { cause?: unknown; clientMessage?: string; log?: boolean }
  ): ServerResult<never>;
  throwableAsync<T>(fn: () => ServerResultAsync<T>): ServerResultAsync<T>;
  handleUnknownError(error: unknown): ServerError;
};

type PermissionServiceProcedureHost<
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
> = BaseServiceProcedureHost<Repositories, Services> & {
  checkPermission<T extends Entity>(
    ctx: { session: Session; user: User },
    action: string,
    entities?: T | T[],
    grants?: ResourceActionGrant[]
  ): boolean;
  checkPermissionAsync<T extends Entity>(
    ctx: { session: Session; user: User },
    action: string,
    getEntities: () => ServerResultAsync<T | T[] | undefined>,
    grants?: ResourceActionGrant[]
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
    hasUser: Boolean(ctx.user),
    hasSession: Boolean(ctx.session),
  });
}

function createRequireAuthStep<Repositories extends RepositoryMap, Services extends ServiceMap>(
  host: BaseServiceProcedureHost<Repositories, Services>
): ProcedureRuntimeStep<Repositories, Services> {
  return {
    stage: "auth",
    stepName: "auth",
    run: async ({ ctx }) => {
      if (!ctx.user || !ctx.session) {
        return host.error("UNAUTHORIZED", "Unauthorized");
      }

      return ok(true);
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

  return {
    stage: "input",
    stepName: "contextFilter",
    run: async ({ input, ctx }) =>
      ok(host.addContextFilter(ctx as Context, contextInclude, input as QueryInput)),
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
      if (!typedArgs.ctx.user || !typedArgs.ctx.session) {
        return host.error("UNAUTHORIZED", "Unauthorized");
      }

      const permissionContext = {
        user: typedArgs.ctx.user,
        session: typedArgs.ctx.session,
      };

      if ("entityStep" in config && typeof config.entityStep === "string") {
        const entities = typedArgs.state[config.entityStep] as TEntities;
        const hasPermission = host.checkPermission(
          permissionContext,
          config.action,
          entities as Entity | Entity[] | undefined,
          config.grants
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
          permissionContext,
          config.action,
          async () => {
            const entityResult = await normalizeProcedureResult(resolveEntities(typedArgs));
            if (entityResult.isOk()) {
              loadedEntities = entityResult.value;
            }
            return entityResult;
          },
          config.grants
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
        permissionContext,
        config.action,
        entities,
        config.grants
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
    host.throwableAsync(async () => {
      const state: ServiceProcedureState = {};
      const startTime = Date.now();
      const typedCtx = ctx as ServiceProcedureContext;
      let currentInput: unknown = input;

      logProcedureStage(host, config.name, typedCtx, "start");

      try {
        for (const step of config.steps) {
          const stepResult = await step.run({
            input: currentInput,
            ctx: typedCtx,
            state,
            repository: host.repository,
            service: host.service,
            logger: host.logger,
          });

          if (stepResult.isErr()) {
            logProcedureStage(host, config.name, typedCtx, getFailureStage(stepResult.error.code), {
              stepName: step.stepName,
              durationMs: Date.now() - startTime,
              errorCode: stepResult.error.code,
            });
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

        const handlerResult = await normalizeProcedureResult(
          handler({
            input: currentInput as TInput,
            ctx: ctx as TCtx,
            state: state as State,
            repository: host.repository,
            service: host.service,
            logger: host.logger,
          })
        );

        if (handlerResult.isErr()) {
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
    });
}

export function createServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
>(
  host: BaseServiceProcedureHost<Repositories, Services>,
  config: ProcedureBuilderConfig<Repositories, Services>
): ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State> {
  function addContextFilter(include?: readonly ServiceProcedureContextFilterScope[]) {
    const steps = hasStepName(config.steps, "auth")
      ? config.steps
      : [...config.steps, createRequireAuthStep(host)];

    assertUniqueStepName(steps, "contextFilter");

    return createServiceProcedureBuilder<
      ServiceProcedureContextFilteredInput<TInput>,
      TCtx & Context,
      Repositories,
      Services,
      State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> }
    >(host, {
      ...config,
      steps: [...steps, createContextFilterStep(host, include)],
    });
  }

  const builder: ServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State> = {
    use<StepName extends string, TOutput = undefined>(
      stepName: StepName,
      step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
    ) {
      assertUniqueStepName(config.steps, stepName);
      return createServiceProcedureBuilder<
        TInput,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureStoredValue<TOutput>>
      >(host, {
        ...config,
        steps: [...config.steps, createUseStep(stepName, step)],
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
        State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>
      >(host, {
        ...config,
        steps: [...config.steps, createInputStep(stepName, step)],
      });
    },
    addContextFilter,
    requireAuth() {
      assertUniqueStepName(config.steps, "auth");
      return createServiceProcedureBuilder<TInput, TCtx & Context, Repositories, Services, State>(
        host,
        {
          ...config,
          steps: [...config.steps, createRequireAuthStep(host)],
        }
      );
    },
    handle<TOutput>(
      handler: ServiceProcedureHandler<TInput, TCtx, Repositories, Services, State, TOutput>
    ) {
      return createProcedureHandler(host, config, handler);
    },
  };

  return builder;
}

export function createPermissionServiceProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends RepositoryMap,
  Services extends ServiceMap,
  State extends ServiceProcedureState = Record<string, never>,
>(
  host: PermissionServiceProcedureHost<Repositories, Services>,
  config: ProcedureBuilderConfig<Repositories, Services>
): PermissionServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State> {
  function addContextFilter(include?: readonly ServiceProcedureContextFilterScope[]) {
    const steps = hasStepName(config.steps, "auth")
      ? config.steps
      : [...config.steps, createRequireAuthStep(host)];

    assertUniqueStepName(steps, "contextFilter");

    return createPermissionServiceProcedureBuilder<
      ServiceProcedureContextFilteredInput<TInput>,
      TCtx & Context,
      Repositories,
      Services,
      State & { contextFilter: ServiceProcedureContextFilteredInput<TInput> }
    >(host, {
      ...config,
      steps: [...steps, createContextFilterStep(host, include)],
    });
  }

  function access(
    accessConfig: ServiceProcedureAccessEntitiesConfig<TInput, TCtx, Repositories, Services, State>
  ): PermissionServiceProcedureBuilder<TInput, TCtx & Context, Repositories, Services, State>;
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
    TCtx & Context,
    Repositories,
    Services,
    State & { access: TEntities }
  >;
  function access<StepName extends ServiceProcedureEntityStepName<State>>(
    accessConfig: ServiceProcedureAccessStateConfig<State, StepName>
  ): PermissionServiceProcedureBuilder<
    TInput,
    TCtx & Context,
    Repositories,
    Services,
    State & { access: State[StepName] }
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
      TCtx & Context,
      Repositories,
      Services,
      State
    >(host, {
      ...config,
      steps: [...config.steps, createAccessStep(host, accessConfig)],
    });
  }

  const builder: PermissionServiceProcedureBuilder<TInput, TCtx, Repositories, Services, State> = {
    use<StepName extends string, TOutput = undefined>(
      stepName: StepName,
      step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
    ) {
      assertUniqueStepName(config.steps, stepName);
      return createPermissionServiceProcedureBuilder<
        TInput,
        TCtx,
        Repositories,
        Services,
        State & Record<StepName, ServiceProcedureStoredValue<TOutput>>
      >(host, {
        ...config,
        steps: [...config.steps, createUseStep(stepName, step)],
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
        State & Record<StepName, ServiceProcedureStoredValue<TNextInput>>
      >(host, {
        ...config,
        steps: [...config.steps, createInputStep(stepName, step)],
      });
    },
    addContextFilter,
    requireAuth() {
      assertUniqueStepName(config.steps, "auth");
      return createPermissionServiceProcedureBuilder<
        TInput,
        TCtx & Context,
        Repositories,
        Services,
        State
      >(host, {
        ...config,
        steps: [...config.steps, createRequireAuthStep(host)],
      });
    },
    access,
    handle<TOutput>(
      handler: ServiceProcedureHandler<TInput, TCtx, Repositories, Services, State, TOutput>
    ) {
      return createProcedureHandler(host, config, handler);
    },
  };

  return builder;
}
