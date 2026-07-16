import { createBackendRouterMap } from "../../app";
import type { Grant } from "../base/base.grants";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as connectTables from "./connect.db";
import { defaultConnectGrants } from "./connect.grants";
import { ConnectRepository } from "./connect.repository";
import { createConnectRouter } from "./connect.router";
import { ConnectService } from "./connect.service";
import { createConnectTRPC } from "./connect.trpc";
import type { ConnectProvider } from "./connect.types";

type ConnectModuleDeps = never;
type ConnectModuleTables = typeof connectTables;
type ConnectModuleRepositories = {
  connect: ConnectRepository;
};
type ConnectModuleServices = {
  connect: ConnectService;
};
type ConnectModuleRouters<Namespace extends string> = {
  [K in Namespace]: ReturnType<typeof createConnectTRPC>;
};

export class ConnectModule<const Namespace extends string = "connect"> extends BaseModule<
  ConnectModuleDeps,
  ConnectModuleTables,
  ConnectModuleRepositories,
  ConnectModuleServices,
  ConnectModuleRouters<Namespace>
> {
  readonly id = "connect";
  private readonly grants: Grant[];

  constructor(
    private readonly providers: ConnectProvider[],
    private readonly options: {
      namespace?: Namespace;
      mountPath?: string;
      grants?: Grant[];
    } = {}
  ) {
    super();
    this.grants = options.grants ?? defaultConnectGrants;
  }

  override repositories({ db }: ModuleRepositoriesContext<ConnectModuleDeps, ConnectModuleTables>) {
    return {
      connect: new ConnectRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.connect,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<ConnectModuleDeps, ConnectModuleRepositories>) {
    return {
      connect: new ConnectService({ connect: repositories.connect }, this.providers, this.grants),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<ConnectModuleDeps, ConnectModuleServices>) {
    const namespace = (this.options.namespace ?? "connect") as Namespace;
    return createBackendRouterMap(namespace, createConnectTRPC(trpc, services.connect));
  }

  override express({
    infra,
    services,
    authMiddleware,
  }: ModuleExpressContext<ConnectModuleDeps, ConnectModuleServices>) {
    if (!authMiddleware) return;
    const mountPath = this.options.mountPath ?? "/connect";
    infra.express.use(mountPath, createConnectRouter(authMiddleware, services.connect));
  }
}
