import type { AnyRouter } from "@trpc/server";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import type {
  BackendAppAuthFactoryContext,
  BackendModuleAuthContext,
  BackendModuleDbContext,
  BackendModuleDependencyMap,
  BackendModuleExpressContext,
  BackendModuleLifecycleContext,
  BackendModuleRepositoriesContext,
  BackendModuleServicesContext,
  BackendModuleTRPCContext,
  BackendModuleWorkflowContext,
} from "../../app";
import type { BetterAuth } from "../auth/auth.lib";

type AnyRecord = Record<string, any>;
export type TableMap = Record<string, SQLiteTableWithColumns<any>>;

/** Allow `never` / `{}` as “no deps” in first generic (e.g. legacy `BaseModule<never>`). */
export type BaseModuleDeps = Record<string, BaseModule<any, any, any, any, any>> | Record<string, never>;

/** True when `Deps` has no keys (e.g. `never` or `{}` for modules with no declared deps). */
type IsDepsEmpty<Deps extends BaseModuleDeps> = [keyof Deps] extends [never] ? true : false;

export type ModuleTypedDeps<Deps extends BaseModuleDeps> = IsDepsEmpty<Deps> extends true
  ? BackendModuleDependencyMap
  : { [K in keyof Deps & string]: BackendModuleDependencyMap[string] } & BackendModuleDependencyMap;

export type ModuleDbContext<Deps extends BaseModuleDeps = Record<string, never>> = Omit<
  BackendModuleDbContext,
  "deps"
> & {
  deps: ModuleTypedDeps<Deps>;
};

export type ModuleRepositoriesContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Tables extends TableMap = TableMap,
> = Omit<BackendModuleRepositoriesContext<Tables>, "deps"> & {
  deps: ModuleTypedDeps<Deps>;
};

export type ModuleServicesContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Repositories extends Record<string, unknown> = AnyRecord,
> = Omit<BackendModuleServicesContext, "deps" | "repositories"> & {
  deps: ModuleTypedDeps<Deps>;
  repositories: Repositories & AnyRecord;
};

export type ModuleTRPCContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Services extends Record<string, unknown> = AnyRecord,
> = Omit<BackendModuleTRPCContext, "deps" | "services"> & {
  deps: ModuleTypedDeps<Deps>;
  services: Services & AnyRecord;
};

export type ModuleExpressContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Services extends Record<string, unknown> = AnyRecord,
> = Omit<BackendModuleExpressContext, "deps" | "services"> & {
  deps: ModuleTypedDeps<Deps>;
  services: Services & AnyRecord;
};

export type ModuleWorkflowContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Services extends Record<string, unknown> = AnyRecord,
> = Omit<BackendModuleWorkflowContext, "deps" | "services"> & {
  deps: ModuleTypedDeps<Deps>;
  services: Services & AnyRecord;
};

export type ModuleLifecycleContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Services extends Record<string, unknown> = AnyRecord,
> = Omit<BackendModuleLifecycleContext, "deps" | "services"> & {
  deps: ModuleTypedDeps<Deps>;
  services: Services & AnyRecord;
};

export type ModuleRuntimeMap = BackendModuleServicesContext["modules"];

/** Marker substring in the module class `name` for the kernel auth slot (see `isAuthKernelModule`). */
export const AUTH_MODULE_CLASS_NAME_MARKER = "AuthModule";

/** Context passed to `createBetterAuth` on the auth module (aligned with `BackendAppConfig.auth.factory`). */
export type ModuleAuthContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Services extends Record<string, unknown> = AnyRecord,
> = Omit<BackendAppAuthFactoryContext, "services"> & {
  services: Services & Record<string, AnyRecord>;
  deps: ModuleTypedDeps<Deps>;
};

export type ModuleAuthHookContext<
  Deps extends BaseModuleDeps = Record<string, never>,
  Repositories extends Record<string, unknown> = AnyRecord,
  Services extends Record<string, unknown> = AnyRecord,
> = Omit<BackendModuleAuthContext, "deps" | "repositories" | "services"> & {
  deps: ModuleTypedDeps<Deps>;
  repositories: Repositories & AnyRecord;
  services: Services & AnyRecord;
};

/**
 * Class-based backend module. Subclasses declare `id`, optional `dependsOn` / `optionalDependsOn`,
 * and lifecycle hooks. The app orchestrates hook order and injects `ctx.deps` for declared dependencies.
 */
export abstract class BaseModule<
  Deps extends BaseModuleDeps = Record<string, never>,
  Tables extends TableMap = TableMap,
  Repositories extends Record<string, unknown> = AnyRecord,
  Services extends Record<string, unknown> = AnyRecord,
  Routers extends Record<string, AnyRouter> = Record<string, never>,
> {
  abstract readonly id: string;

  readonly dependsOn?: readonly (keyof Deps & string)[];
  readonly optionalDependsOn?: readonly string[];

  db?(ctx: ModuleDbContext<Deps>): { tables: Tables } | undefined;

  repositories?(ctx: ModuleRepositoriesContext<Deps, Tables>): Repositories | undefined;

  services?(ctx: ModuleServicesContext<Deps, Repositories>): Services | undefined;

  trpc?(ctx: ModuleTRPCContext<Deps, Services>): Routers | undefined;

  express?(ctx: ModuleExpressContext<Deps, Services>): void;

  workflows?(ctx: ModuleWorkflowContext<Deps, Services>): void;

  auth?(ctx: ModuleAuthHookContext<Deps, Repositories, Services>): BetterAuth | undefined;

  startup?(ctx: ModuleLifecycleContext<Deps, Services>): Promise<void> | void;

  shutdown?(ctx: ModuleLifecycleContext<Deps, Services>): Promise<void> | void;
}
