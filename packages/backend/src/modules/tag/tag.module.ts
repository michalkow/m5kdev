import { createBackendRouterMap, defineBackendModule } from "../../app";
import { createTagTables } from "./tag.db";
import { TagRepository } from "./tag.repository";
import { TagService } from "./tag.service";
import { createTagTRPC } from "./tag.trpc";

export type CreateTagBackendModuleOptions<Namespace extends string = string> = {
  id?: string;
  namespace?: Namespace;
  authModuleId?: string;
};

export function createTagBackendModule<const Namespace extends string = "tag">(
  options: CreateTagBackendModuleOptions<Namespace> = {}
) {
  const id = options.id ?? "tag";
  const namespace = (options.namespace ?? "tag") as Namespace;
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    db: ({ deps }) => {
      const authTables = deps[authModuleId].tables as any;
      return {
      tables: createTagTables({
        users: authTables.users,
        organizations: authTables.organizations,
        teams: authTables.teams,
      }),
      };
    },
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        tag: new TagRepository({
          orm: db.orm as never,
          schema,
          table: schema.tags,
        }),
      };
    },
    services: ({ repositories }) => ({
      tag: new TagService({ tag: repositories.tag }, {}),
    }),
    trpc: ({ trpc, services }) =>
      createBackendRouterMap(namespace, createTagTRPC(trpc, services.tag)),
  });
}
