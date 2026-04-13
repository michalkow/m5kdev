import type { ConnectProvider } from "./connect.types";
import { createBackendRouterMap, defineBackendModule } from "../../app";
import * as connectTables from "./connect.db";
import { ConnectRepository } from "./connect.repository";
import { createConnectRouter } from "./connect.router";
import { ConnectService } from "./connect.service";
import { createConnectTRPC } from "./connect.trpc";

export type CreateConnectBackendModuleOptions<Namespace extends string = string> = {
  id?: string;
  namespace?: Namespace;
  mountPath?: string;
  providers: ConnectProvider[];
};

export function createConnectBackendModule<const Namespace extends string = "connect">(
  options: CreateConnectBackendModuleOptions<Namespace>
) {
  const id = options.id ?? "connect";
  const namespace = (options.namespace ?? "connect") as Namespace;
  const mountPath = options.mountPath ?? "/connect";

  return defineBackendModule({
    id,
    db: () => ({
      tables: { ...connectTables },
    }),
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        connect: new ConnectRepository({
          orm: db.orm as never,
          schema,
          table: schema.connect,
        }),
      };
    },
    services: ({ repositories }) => ({
      connect: new ConnectService({ connect: repositories.connect }, options.providers),
    }),
    trpc: ({ trpc, services }) =>
      createBackendRouterMap(namespace, createConnectTRPC(trpc, services.connect)),
    express: ({ infra, services, authMiddleware }) => {
      if (!authMiddleware) return;
      infra.express.use(mountPath, createConnectRouter(authMiddleware, services.connect));
    },
  });
}
