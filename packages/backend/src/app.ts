import { type Client, createClient, type Config as LibSQLClientConfig } from "@libsql/client";
import { transformer } from "@m5kdev/commons/utils/trpc";
import type { AnyRouter, TRPCCreateRouterOptions } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import express, { type Express } from "express";
import IORedis, { type RedisOptions } from "ioredis";
import type { Logger } from "pino";
import { Resend } from "resend";
import { defaultMergedSchema, moduleTableMap } from "./db/module-schema";
import type * as authTables from "./modules/auth/auth.db";
import type { BetterAuth } from "./modules/auth/auth.lib";
import { createAuthMiddleware, createRoleAuthMiddleware } from "./modules/auth/auth.middleware";
import type { BaseModule } from "./modules/base/base.module";
import { WorkflowRegistry } from "./modules/workflow/workflow.registry";
import { WorkflowService } from "./modules/workflow/workflow.service";
import { logger as rootLogger } from "./utils/logger";
import {
  createAuthContext,
  createRequestContext,
  createTRPCMethods,
  type RequestContext,
  type TRPCMethods,
} from "./utils/trpc";

type AnyRecord = Record<string, any>;
type TableMap = Record<string, SQLiteTableWithColumns<any>>;
type RouterMap = Record<string, AnyRouter>;

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer I
) => void
  ? I
  : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Structural module contract satisfied by both `BaseModule` subclasses and
 * plain `defineBackendModule(...)` objects. The kernel accepts either shape.
 */
export type BackendAppModule = {
  readonly id: string;
  readonly dependsOn?: readonly string[];
  readonly optionalDependsOn?: readonly string[];
  /** DB-only dependencies (tables only). Not used for service init ordering. */
  readonly dbDependsOn?: readonly string[];
  repositories?(ctx: any): any;
  services?(ctx: any): any;
  auth?(ctx: any): any;
  trpc?(ctx: any): any;
  express?(ctx: any): void;
  workflows?(ctx: any): void;
  startup?(ctx: any): Promise<void> | void;
  shutdown?(ctx: any): Promise<void> | void;
};

type ExtractModuleRouters<M> = M extends BaseModule<any, any, any, any, infer Routers>
  ? Routers
  : M extends BackendModuleDefinition<any, any, any, any, infer Routers>
    ? Routers
    : {};

type BuiltModuleRouters<Modules extends readonly BackendAppModule[]> = Simplify<
  UnionToIntersection<ExtractModuleRouters<Modules[number]>>
> extends infer TRouters
  ? TRouters extends TRPCCreateRouterOptions
    ? TRouters
    : never
  : never;

type DefinedBackendModule<T extends BackendModuleDefinition> = T extends BackendModuleDefinition<
  infer Id,
  infer Tables,
  infer Repositories,
  infer Services,
  infer TRouters
>
  ? BackendModuleDefinition<Id, Tables, Repositories, Services, TRouters>
  : never;

type BuiltModuleRuntime = {
  id: string;
  tables: TableMap;
  repositories: AnyRecord;
  services: AnyRecord;
  routers: RouterMap;
};

type ModuleRuntimeMap = Record<string, BuiltModuleRuntime>;

type AppDbSchema<Tables extends TableMap = TableMap> = Tables & typeof authTables;

export type BackendAppRouterMap<Modules extends readonly BackendAppModule[]> = Simplify<
  UnionToIntersection<ExtractModuleRouters<Modules[number]>>
>;

export type BackendAppMetadata = {
  name?: string;
  urls?: {
    web?: string;
    api?: string;
  };
  brand?: {
    logo?: string;
    tagline?: string;
  };
};

export type BackendAppEmailMode = "send" | "log" | "store";

export type BackendAppEmailOptions = {
  mode?: BackendAppEmailMode;
  from?: string;
  systemNotificationEmail?: string;
  outputDirectory?: string;
};

type ResolvedBackendAppMetadata = {
  name?: string;
  urls: {
    web?: string;
    api?: string;
  };
  brand: {
    logo?: string;
    tagline?: string;
  };
};

type ResolvedBackendAppEmailOptions = {
  mode: BackendAppEmailMode;
  from?: string;
  systemNotificationEmail?: string;
  outputDirectory: string;
};

export type BackendModuleDependencyMap = Record<
  string,
  {
    tables: TableMap;
    repositories: AnyRecord;
    services: AnyRecord;
    routers: RouterMap;
  }
>;

export type BackendModuleRepositoriesContext<Tables extends TableMap = TableMap> = {
  env: Record<string, string | undefined>;
  logger: Logger;
  appConfig: ResolvedBackendAppMetadata;
  emailConfig: ResolvedBackendAppEmailOptions;
  deps: BackendModuleDependencyMap;
  db: {
    client: Client;
    orm: LibSQLDatabase<any>;
    schema: AppDbSchema<Tables>;
  };
  infra: {
    express: Express;
    redis?: IORedis;
    resend?: Resend;
  };
};

export type BackendModuleServicesContext = {
  env: Record<string, string | undefined>;
  logger: Logger;
  appConfig: ResolvedBackendAppMetadata;
  emailConfig: ResolvedBackendAppEmailOptions;
  deps: BackendModuleDependencyMap;
  repositories: AnyRecord;
  modules: ModuleRuntimeMap;
  db: {
    client: Client;
    orm: LibSQLDatabase<any>;
    schema: AppDbSchema;
  };
  infra: {
    express: Express;
    redis?: IORedis;
    resend?: Resend;
  };
};

export type BackendModuleAuthContext = BackendModuleServicesContext & {
  services: AnyRecord;
  auth?: BetterAuth;
};

export type BackendModuleTRPCContext = BackendModuleServicesContext & {
  services: AnyRecord;
  trpc: TRPCMethods;
  auth?: BetterAuth;
};

export type BackendModuleExpressContext = BackendModuleServicesContext & {
  services: AnyRecord;
  auth?: BetterAuth;
  authMiddleware?: ReturnType<typeof createAuthMiddleware>;
  roleAuthMiddleware?: ReturnType<typeof createRoleAuthMiddleware>;
};

export type BackendModuleWorkflowContext = BackendModuleServicesContext & {
  services: AnyRecord;
  workflow?: {
    service: WorkflowService;
    registry: WorkflowRegistry;
  };
};

export type BackendModuleLifecycleContext = BackendModuleWorkflowContext & {
  auth?: BetterAuth;
  authMiddleware?: ReturnType<typeof createAuthMiddleware>;
  roleAuthMiddleware?: ReturnType<typeof createRoleAuthMiddleware>;
  trpc: {
    router: AnyRouter;
    methods: TRPCMethods;
    mountPath: string;
    createContext: (opts: any) => Promise<RequestContext>;
  };
};

export type BackendModuleDefinition<
  Id extends string = string,
  Tables extends TableMap = TableMap,
  Repositories extends AnyRecord = AnyRecord,
  Services extends AnyRecord = AnyRecord,
  TRouters extends RouterMap = {},
> = {
  id: Id;
  dependsOn?: readonly string[];
  optionalDependsOn?: readonly string[];
  /** DB-only dependencies (tables only). Not used for service init ordering. */
  dbDependsOn?: readonly string[];
  repositories?: (ctx: BackendModuleRepositoriesContext) => Repositories | void;
  services?: (ctx: BackendModuleServicesContext) => Services | void;
  auth?: (ctx: BackendModuleAuthContext) => BetterAuth | void;
  trpc?: (ctx: BackendModuleTRPCContext) => TRouters | void;
  express?: (ctx: BackendModuleExpressContext) => void;
  workflows?: (ctx: BackendModuleWorkflowContext) => void;
  startup?: (ctx: BackendModuleLifecycleContext) => Promise<void> | void;
  shutdown?: (ctx: BackendModuleLifecycleContext) => Promise<void> | void;
};

export type BackendAppAuthFactoryContext = {
  env: Record<string, string | undefined>;
  logger: Logger;
  appConfig: ResolvedBackendAppMetadata;
  emailConfig: ResolvedBackendAppEmailOptions;
  express: Express;
  redis?: IORedis;
  resend?: Resend;
  db: {
    client: Client;
    orm: LibSQLDatabase<any>;
    schema: AppDbSchema;
  };
  modules: ModuleRuntimeMap;
  repositories: Record<string, AnyRecord>;
  services: Record<string, AnyRecord>;
};

export type BackendAppConfig = {
  db:
    | {
        client: Client;
      }
    | (LibSQLClientConfig & {
        client?: never;
      });
  express?: Express;
  redis?:
    | IORedis
    | {
        create(): IORedis;
      }
    | {
        url: string;
        options?: RedisOptions;
      };
  logger?: Logger;
  env?: Record<string, string | undefined>;
  app?: BackendAppMetadata;
  auth?: {
    factory(ctx: BackendAppAuthFactoryContext): BetterAuth;
  };
  resend?:
    | Resend
    | {
        apiKey: string;
      };
  email?: BackendAppEmailOptions;
  trpc?: {
    mountPath?: string;
  };
  schema?: AppDbSchema;
};

export function defineBackendModule<const T extends BackendModuleDefinition>(
  definition: T
): DefinedBackendModule<T> {
  return definition as unknown as DefinedBackendModule<T>;
}

export function defineBackendModules<const T extends readonly BackendAppModule[]>(modules: T): T {
  return modules;
}

export function createBackendRouterMap<const Namespace extends string, Router extends AnyRouter>(
  namespace: Namespace,
  router: Router
): { [K in Namespace]: Router } {
  return { [namespace]: router } as { [K in Namespace]: Router };
}

function isWorkflowService(value: unknown): value is WorkflowService {
  return value instanceof WorkflowService;
}

function normalizeEnv(env: BackendAppConfig["env"]): Record<string, string | undefined> {
  return (env ?? (process.env as Record<string, string | undefined>)) as Record<
    string,
    string | undefined
  >;
}

function normalizeAppConfig(
  config: BackendAppConfig["app"],
  env: Record<string, string | undefined>
): ResolvedBackendAppMetadata {
  const webUrl = config?.urls?.web ?? env.VITE_APP_URL;
  const apiUrl = config?.urls?.api ?? env.VITE_SERVER_URL;

  return {
    name: config?.name,
    urls: {
      web: webUrl,
      api: apiUrl,
    },
    brand: {
      logo: config?.brand?.logo ?? (webUrl ? new URL("/mark.svg", webUrl).toString() : undefined),
      tagline:
        config?.brand?.tagline ??
        (config?.name ? `${config.name} publishing workspace` : undefined),
    },
  };
}

function normalizeEmailConfig(
  config: BackendAppConfig["email"],
  env: Record<string, string | undefined>
): ResolvedBackendAppEmailOptions {
  return {
    mode: config?.mode ?? (env.NODE_ENV === "development" ? "log" : "send"),
    from: config?.from ?? env.EMAIL_FROM ?? env.RESEND_FROM,
    systemNotificationEmail: config?.systemNotificationEmail ?? env.SYSTEM_NOTIFICATION_EMAIL,
    outputDirectory: config?.outputDirectory ?? ".emails",
  };
}

function createDbClient(config: BackendAppConfig["db"]): { client: Client; owned: boolean } {
  if ("client" in config && config.client) {
    return {
      client: config.client,
      owned: false,
    };
  }

  return {
    client: createClient(config),
    owned: true,
  };
}

function createRedisClient(config: BackendAppConfig["redis"]): { redis?: IORedis; owned: boolean } {
  if (!config) {
    return {
      redis: undefined,
      owned: false,
    };
  }

  if (config instanceof IORedis) {
    return {
      redis: config,
      owned: false,
    };
  }

  if ("create" in config) {
    return {
      redis: config.create(),
      owned: true,
    };
  }

  return {
    redis: config.options ? new IORedis(config.url, config.options) : new IORedis(config.url),
    owned: true,
  };
}

function createResendClient(config: BackendAppConfig["resend"]): {
  resend?: Resend;
  owned: boolean;
} {
  if (!config) {
    return {
      resend: undefined,
      owned: false,
    };
  }

  if (config instanceof Resend) {
    return {
      resend: config,
      owned: false,
    };
  }

  return {
    resend: new Resend(config.apiKey),
    owned: true,
  };
}

function resolveModuleOrder(modules: readonly BackendAppModule[]): BackendAppModule[] {
  const modulesById = new Map<string, BackendAppModule>();

  for (const module of modules) {
    if (modulesById.has(module.id)) {
      throw new Error(`Duplicate backend module id "${module.id}"`);
    }
    modulesById.set(module.id, module);
  }

  for (const module of modules) {
    for (const depId of module.dependsOn ?? []) {
      if (!modulesById.has(depId)) {
        throw new Error(`Backend module "${module.id}" is missing required dependency "${depId}"`);
      }
    }

    for (const depId of module.dbDependsOn ?? []) {
      if (!modulesById.has(depId)) {
        throw new Error(`Backend module "${module.id}" is missing db dependency "${depId}"`);
      }
    }
  }

  const ordered: BackendAppModule[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  const visit = (module: BackendAppModule, path: string[] = []) => {
    if (permanent.has(module.id)) return;
    if (temporary.has(module.id)) {
      throw new Error(
        `Circular backend module dependency detected: ${[...path, module.id].join(" -> ")}`
      );
    }

    temporary.add(module.id);
    const dependencyIds = [...(module.dependsOn ?? []), ...(module.optionalDependsOn ?? [])];
    for (const depId of dependencyIds) {
      const dependency = modulesById.get(depId);
      if (!dependency) continue;
      visit(dependency, [...path, module.id]);
    }
    temporary.delete(module.id);
    permanent.add(module.id);
    ordered.push(module);
  };

  for (const module of modules) {
    visit(module);
  }

  return ordered;
}

function createDependencyMap(
  module: BackendAppModule,
  moduleStates: Map<string, BuiltModuleRuntime>,
  includeDbDeps = false
): BackendModuleDependencyMap {
  const deps: BackendModuleDependencyMap = {};
  const dependencyIds = [
    ...(module.dependsOn ?? []),
    ...(module.optionalDependsOn ?? []),
    ...(includeDbDeps ? (module.dbDependsOn ?? []) : []),
  ];

  for (const depId of dependencyIds) {
    const dep = moduleStates.get(depId);
    if (!dep) continue;
    deps[depId] = {
      tables: dep.tables,
      repositories: dep.repositories,
      services: dep.services,
      routers: dep.routers,
    };
  }
  return deps;
}

export function createBackendApp<const Modules extends readonly BackendAppModule[] = []>(
  config: BackendAppConfig,
  registeredModules = [] as unknown as Modules
) {
  const env = normalizeEnv(config.env);
  const logger = config.logger ?? rootLogger;
  const appConfig = normalizeAppConfig(config.app, env);
  const emailConfig = normalizeEmailConfig(config.email, env);

  const orderedModules = resolveModuleOrder(registeredModules);
  const expressApp = config.express ?? express();
  const dbClientState = createDbClient(config.db);
  const redisState = createRedisClient(config.redis);
  const resendState = createResendClient(config.resend);
  const moduleStates = new Map<string, BuiltModuleRuntime>();
  const schema: AppDbSchema = config.schema ?? ({} as unknown as AppDbSchema);

  const orm = drizzle(dbClientState.client, { schema });
  const repositoryModules: Record<string, AnyRecord> = {};
  const serviceModules: Record<string, AnyRecord> = {};

  for (const module of orderedModules) {
    moduleStates.set(module.id, {
      id: module.id,
      tables: (moduleTableMap as Record<string, TableMap>)[module.id] ?? {},
      repositories: {},
      services: {},
      routers: {},
    });
  }

  for (const module of orderedModules) {
    const deps = createDependencyMap(module, moduleStates);
    const state = moduleStates.get(module.id)!;
    const repositories =
      module.repositories?.({
        env,
        logger,
        appConfig,
        emailConfig,
        deps,
        db: {
          client: dbClientState.client,
          orm,
          schema,
        },
        infra: {
          express: expressApp,
          redis: redisState.redis,
          resend: resendState.resend,
        },
      } as any) ?? {};
    state.repositories = repositories;
    repositoryModules[module.id] = repositories;
  }

  for (const module of orderedModules) {
    const deps = createDependencyMap(module, moduleStates);
    const state = moduleStates.get(module.id)!;
    const services =
      module.services?.({
        env,
        logger,
        appConfig,
        emailConfig,
        deps,
        repositories: state.repositories,
        modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
        db: {
          client: dbClientState.client,
          orm,
          schema,
        },
        infra: {
          express: expressApp,
          redis: redisState.redis,
          resend: resendState.resend,
        },
      } as any) ?? {};
    state.services = services;
    serviceModules[module.id] = services;
  }

  let auth: BetterAuth | undefined = config.auth?.factory({
    env,
    logger,
    appConfig,
    emailConfig,
    express: expressApp,
    redis: redisState.redis,
    resend: resendState.resend,
    db: {
      client: dbClientState.client,
      orm,
      schema,
    },
    modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
    repositories: repositoryModules,
    services: serviceModules,
  });

  for (const module of orderedModules) {
    const candidate = module.auth?.({
      env,
      logger,
      appConfig,
      emailConfig,
      deps: createDependencyMap(module, moduleStates),
      repositories: moduleStates.get(module.id)!.repositories,
      services: moduleStates.get(module.id)!.services,
      modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
      db: {
        client: dbClientState.client,
        orm,
        schema,
      },
      infra: {
        express: expressApp,
        redis: redisState.redis,
        resend: resendState.resend,
      },
      auth,
    } as any);

    if (!candidate) continue;
    if (auth && auth !== candidate) {
      throw new Error(
        `Backend auth runtime already created before module "${module.id}" tried to provide one`
      );
    }
    auth = candidate;
  }

  let workflowRuntime:
    | {
        service: WorkflowService;
        registry: WorkflowRegistry;
      }
    | undefined;

  for (const module of orderedModules) {
    const state = moduleStates.get(module.id)!;
    for (const service of Object.values(state.services)) {
      if (isWorkflowService(service)) {
        if (workflowRuntime) {
          throw new Error("Multiple WorkflowService instances detected; only one is supported");
        }
        workflowRuntime = {
          service,
          registry: new WorkflowRegistry(service),
        };
      }
    }
  }

  if (workflowRuntime) {
    for (const state of moduleStates.values()) {
      for (const service of Object.values(state.services)) {
        if (!service || typeof service !== "object") continue;
        workflowRuntime.registry.registerService(service as Record<string, unknown>);
      }
    }
  }

  const trpcMethods = createTRPCMethods();
  const routerFragments = {} as BuiltModuleRouters<Modules>;
  const createContext = auth ? createAuthContext(auth) : createRequestContext();
  const trpcMountPath = config.trpc?.mountPath ?? "/trpc";

  for (const module of orderedModules) {
    const state = moduleStates.get(module.id)!;
    const routers =
      module.trpc?.({
        env,
        logger,
        appConfig,
        emailConfig,
        deps: createDependencyMap(module, moduleStates),
        repositories: state.repositories,
        services: state.services,
        modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
        db: {
          client: dbClientState.client,
          orm,
          schema,
        },
        infra: {
          express: expressApp,
          redis: redisState.redis,
          resend: resendState.resend,
        },
        trpc: trpcMethods,
        auth,
      } as any) ?? {};

    for (const [routerKey, router] of Object.entries(routers)) {
      if ((routerFragments as Record<string, unknown>)[routerKey]) {
        throw new Error(
          `Duplicate backend tRPC router namespace "${routerKey}" from module "${module.id}"`
        );
      }
      (routerFragments as Record<string, unknown>)[routerKey] = router;
    }

    state.routers = routers;
  }

  const appRouter = trpcMethods.router(routerFragments as BuiltModuleRouters<Modules>);
  const authMiddleware = auth ? createAuthMiddleware(auth) : undefined;
  const roleAuthMiddleware = auth ? createRoleAuthMiddleware(auth) : undefined;

  if (Object.keys(routerFragments as Record<string, unknown>).length > 0) {
    expressApp.use(
      trpcMountPath,
      trpcExpress.createExpressMiddleware({
        router: appRouter as AnyRouter,
        createContext,
      } as any)
    );
  }

  if (auth) {
    expressApp.all("/api/auth/*", toNodeHandler(auth));
  }

  for (const module of orderedModules) {
    const state = moduleStates.get(module.id)!;
    module.express?.({
      env,
      logger,
      appConfig,
      emailConfig,
      deps: createDependencyMap(module, moduleStates),
      repositories: state.repositories,
      services: state.services,
      modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
      db: {
        client: dbClientState.client,
        orm,
        schema,
      },
      infra: {
        express: expressApp,
        redis: redisState.redis,
        resend: resendState.resend,
      },
      auth,
      authMiddleware,
      roleAuthMiddleware,
    } as any);
  }

  if (workflowRuntime) {
    for (const module of orderedModules) {
      const state = moduleStates.get(module.id)!;
      module.workflows?.({
        env,
        logger,
        appConfig,
        emailConfig,
        deps: createDependencyMap(module, moduleStates),
        repositories: state.repositories,
        services: state.services,
        modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
        db: {
          client: dbClientState.client,
          orm,
          schema,
        },
        infra: {
          express: expressApp,
          redis: redisState.redis,
          resend: resendState.resend,
        },
        workflow: workflowRuntime,
      } as any);
    }
  }

  const lifecycleContext: BackendModuleLifecycleContext = {
    env,
    logger,
    appConfig,
    emailConfig,
    deps: {},
    repositories: {},
    services: {},
    modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
    db: {
      client: dbClientState.client,
      orm,
      schema,
    },
    infra: {
      express: expressApp,
      redis: redisState.redis,
      resend: resendState.resend,
    },
    workflow: workflowRuntime,
    auth,
    authMiddleware,
    roleAuthMiddleware,
    trpc: {
      router: appRouter,
      methods: trpcMethods,
      mountPath: trpcMountPath,
      createContext,
    },
  };

  const startupHooks = orderedModules
    .filter((module) => module.startup)
    .map((module) => () => module.startup?.(lifecycleContext));
  const shutdownHooks = [...orderedModules]
    .reverse()
    .filter((module) => module.shutdown)
    .map((module) => () => module.shutdown?.(lifecycleContext));

  return {
    modules: Object.fromEntries(moduleStates.entries()) as {
      [K in Modules[number]["id"]]: BuiltModuleRuntime;
    },
    db: {
      client: dbClientState.client,
      orm,
      schema,
    },
    config: {
      app: appConfig,
      email: emailConfig,
    },
    express: {
      app: expressApp,
    },
    auth: auth
      ? {
          instance: auth,
          middleware: authMiddleware!,
          roleMiddleware: roleAuthMiddleware!,
        }
      : undefined,
    workflow: workflowRuntime,
    trpc: {
      router: appRouter,
      methods: trpcMethods,
      mountPath: trpcMountPath,
      createContext,
      transformer,
    },
    async start() {
      if (workflowRuntime) {
        await workflowRuntime.registry.start();
      }
      for (const hook of startupHooks) {
        await hook();
      }
    },
    async shutdown() {
      for (const hook of shutdownHooks) {
        await hook();
      }
      if (workflowRuntime) {
        await workflowRuntime.registry.stop();
        await workflowRuntime.service.close();
      }
      if (redisState.owned && redisState.redis) {
        redisState.redis.disconnect();
      }
      if (dbClientState.owned) {
        await dbClientState.client.close?.();
      }
    },
  };
}

export type InferBackendAppRouter<TApp extends typeof createBackendApp> =
  ReturnType<TApp>["trpc"]["router"];
