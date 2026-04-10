import { defineBackendModule } from "../../app";
import { createTagTables } from "./tag.db";
import { TagRepository } from "./tag.repository";
import { TagService } from "./tag.service";
import { createTagTRPC } from "./tag.trpc";

export type CreateTagBackendModuleOptions = {
  id?: string;
  namespace?: string;
  authModuleId?: string;
};

export function createTagBackendModule(options: CreateTagBackendModuleOptions = {}) {
  const id = options.id ?? "tag";
  const namespace = options.namespace ?? "tag";
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
    trpc: ({ trpc, services }) => ({
      [namespace]: createTagTRPC(trpc, services.tag),
    }),
  });
}
