import { createClient, type Client, type Config as LibSQLClientConfig } from "@libsql/client";
import { transformer } from "@m5kdev/commons/utils/trpc";
import type { AnyRouter, TRPCCreateRouterOptions } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { getTableName } from "drizzle-orm";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import { toNodeHandler } from "better-auth/node";
import express, { type Express } from "express";
import IORedis, { type RedisOptions } from "ioredis";
import type { Logger } from "pino";
import { Resend } from "resend";
import { createAuthMiddleware, createRoleAuthMiddleware } from "./modules/auth/auth.middleware";
import type { BetterAuth } from "./modules/auth/auth.lib";
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

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer I) => void
  ? I
  : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type BuiltModuleRouters<Modules extends readonly BackendModuleDefinition[]> = Simplify<
  UnionToIntersection<
    Modules[number] extends BackendModuleDefinition<any, any, any, any, infer TRouters>
      ? TRouters
      : {}
  >
> extends infer TRouters
  ? TRouters extends TRPCCreateRouterOptions
    ? TRouters
    : never
  : never;

type DefinedBackendModule<T extends BackendModuleDefinition> =
  T extends BackendModuleDefinition<infer Id, infer Tables, infer Repositories, infer Services, infer TRouters>
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

type AppDbSchema = Record<string, SQLiteTableWithColumns<any>>;

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

export type BackendModuleDbContext = {
  env: Record<string, string | undefined>;
  logger: Logger;
  appConfig: ResolvedBackendAppMetadata;
  emailConfig: ResolvedBackendAppEmailOptions;
  deps: BackendModuleDependencyMap;
};

export type BackendModuleRepositoriesContext = {
  env: Record<string, string | undefined>;
  logger: Logger;
  appConfig: ResolvedBackendAppMetadata;
  emailConfig: ResolvedBackendAppEmailOptions;
  deps: BackendModuleDependencyMap;
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
  db?: (ctx: BackendModuleDbContext) => { tables?: Tables } | void;
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
};

export function defineBackendModule<const T extends BackendModuleDefinition>(
  definition: T
): DefinedBackendModule<T> {
  return definition as unknown as DefinedBackendModule<T>;
}

export function defineBackendModules<const T extends readonly BackendModuleDefinition[]>(
  modules: T
): T {
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

function createRedisClient(
  config: BackendAppConfig["redis"]
): { redis?: IORedis; owned: boolean } {
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

function createResendClient(
  config: BackendAppConfig["resend"]
): { resend?: Resend; owned: boolean } {
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

function resolveModuleOrder(modules: readonly BackendModuleDefinition[]): BackendModuleDefinition[] {
  const modulesById = new Map<string, BackendModuleDefinition>();

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
  }

  const ordered: BackendModuleDefinition[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  const visit = (module: BackendModuleDefinition, path: string[] = []) => {
    if (permanent.has(module.id)) return;
    if (temporary.has(module.id)) {
      throw new Error(`Circular backend module dependency detected: ${[...path, module.id].join(" -> ")}`);
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
  module: BackendModuleDefinition,
  moduleStates: Map<string, BuiltModuleRuntime>
): BackendModuleDependencyMap {
  const deps: BackendModuleDependencyMap = {};
  for (const depId of [...(module.dependsOn ?? []), ...(module.optionalDependsOn ?? [])]) {
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

export function collectBackendSchema<const Modules extends readonly BackendModuleDefinition[]>(
  modules: Modules,
  options?: Pick<BackendAppConfig, "env" | "logger" | "app" | "email">
) {
  const env = normalizeEnv(options?.env);
  const logger = options?.logger ?? rootLogger;
  const appConfig = normalizeAppConfig(options?.app, env);
  const emailConfig = normalizeEmailConfig(options?.email, env);
  const ordered = resolveModuleOrder(modules);
  const moduleStates = new Map<string, BuiltModuleRuntime>();
  const schema: AppDbSchema = {};
  const tableNameOwners = new Map<string, string>();

  for (const module of ordered) {
    const deps = createDependencyMap(module, moduleStates);
    const dbResult = module.db?.({ env, logger, appConfig, emailConfig, deps });
    const tables = (dbResult?.tables ?? {}) as TableMap;

    for (const [tableKey, table] of Object.entries(tables)) {
      if (schema[tableKey]) {
        throw new Error(
          `Duplicate backend schema key "${tableKey}" from module "${module.id}"`
        );
      }
      const tableName = getTableName(table);
      const owner = tableNameOwners.get(tableName);
      if (owner) {
        throw new Error(
          `Duplicate backend table name "${tableName}" from module "${module.id}" (already defined by "${owner}")`
        );
      }
      tableNameOwners.set(tableName, module.id);
      schema[tableKey] = table;
    }

    moduleStates.set(module.id, {
      id: module.id,
      tables,
      repositories: {},
      services: {},
      routers: {},
    });
  }

  return {
    ordered,
    schema,
    modules: Object.fromEntries(moduleStates.entries()) as ModuleRuntimeMap,
  };
}

export function createBackendApp<const Modules extends readonly BackendModuleDefinition[] = []>(
  config: BackendAppConfig,
  registeredModules = [] as unknown as Modules
) {
  const env = normalizeEnv(config.env);
  const logger = config.logger ?? rootLogger;
  const appConfig = normalizeAppConfig(config.app, env);
  const emailConfig = normalizeEmailConfig(config.email, env);

  return {
    use<const Module extends BackendModuleDefinition>(module: Module) {
      return createBackendApp(config, [...registeredModules, module] as [...Modules, Module]);
    },

    modules: registeredModules,

    build() {
      const orderedModules = resolveModuleOrder(registeredModules);
      const expressApp = config.express ?? express();
      const dbClientState = createDbClient(config.db);
      const redisState = createRedisClient(config.redis);
      const resendState = createResendClient(config.resend);
      const moduleStates = new Map<string, BuiltModuleRuntime>();
      const schema: AppDbSchema = {};
      const tableNameOwners = new Map<string, string>();

      for (const module of orderedModules) {
        const deps = createDependencyMap(module, moduleStates);
        const dbResult = module.db?.({
          env,
          logger,
          appConfig,
          emailConfig,
          deps,
        });
        const tables = dbResult?.tables ?? {};

        for (const [tableKey, table] of Object.entries(tables)) {
          if (schema[tableKey]) {
            throw new Error(
              `Duplicate backend schema key "${tableKey}" from module "${module.id}"`
            );
          }
          const tableName = getTableName(table);
          const owner = tableNameOwners.get(tableName);
          if (owner) {
            throw new Error(
              `Duplicate backend table name "${tableName}" from module "${module.id}" (already defined by "${owner}")`
            );
          }
          tableNameOwners.set(tableName, module.id);
          schema[tableKey] = table;
        }

        moduleStates.set(module.id, {
          id: module.id,
          tables,
          repositories: {},
          services: {},
          routers: {},
        });
      }

      const orm = drizzle(dbClientState.client, { schema });
      const repositoryModules: Record<string, AnyRecord> = {};
      const serviceModules: Record<string, AnyRecord> = {};

      for (const module of orderedModules) {
        const deps = createDependencyMap(module, moduleStates);
        const state = moduleStates.get(module.id)!;
        const repositories =
          (module.repositories?.({
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
          })) ?? {};
        state.repositories = repositories;
        repositoryModules[module.id] = repositories;
      }

      for (const module of orderedModules) {
        const deps = createDependencyMap(module, moduleStates);
        const state = moduleStates.get(module.id)!;
        const services =
          (module.services?.({
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
          })) ?? {};
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
        });

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
              throw new Error(`Multiple WorkflowService instances detected; only one is supported`);
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
          (module.trpc?.({
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
          })) ?? {};

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

      for (const module of registeredModules) {
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
        });
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
          });
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
    },
  };
}

export type InferBackendAppRouter<TApp extends { build(): { trpc: { router: AnyRouter } } }> =
  ReturnType<TApp["build"]>["trpc"]["router"];

export function generateBackendSchemaSource({
  schema,
  schemaExpression = "collected.schema",
  exportName = "schema",
}: {
  schema: AppDbSchema;
  schemaExpression?: string;
  exportName?: string;
}) {
  const tableNames = Object.keys(schema).sort();

  for (const name of tableNames) {
    if (!/^[$A-Z_][0-9A-Z_$]*$/i.test(name)) {
      throw new Error(
        `Backend schema key "${name}" cannot be emitted as a top-level TypeScript export`
      );
    }
  }

  const exportLines = tableNames
    .map((name) => `export const ${name} = ${schemaExpression}.${name};`)
    .join("\n");
  const schemaLines = tableNames.map((name) => `  ${name},`).join("\n");

  return `${exportLines}\n\nexport const ${exportName} = {\n${schemaLines}\n} as const;\n`;
}
