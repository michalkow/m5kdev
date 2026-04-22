import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as tagTables from "./tag.db";
import { TagRepository } from "./tag.repository";
import { TagService } from "./tag.service";
import { createTagTRPC } from "./tag.trpc";

type TagModuleDeps = { auth: AuthModule };
type TagModuleTables = typeof tagTables;
type TagModuleRepositories = {
  tag: TagRepository;
};
type TagModuleServices = {
  tag: TagService;
};
type TagModuleRouters<Namespace extends string> = {
  [K in Namespace]: ReturnType<typeof createTagTRPC>;
};

export class TagModule<const Namespace extends string = "tag"> extends BaseModule<
  TagModuleDeps,
  TagModuleTables,
  TagModuleRepositories,
  TagModuleServices,
  TagModuleRouters<Namespace>
> {
  readonly id = "tag";
  override readonly dependsOn = ["auth"] as const;

  constructor(private readonly options: { namespace?: Namespace } = {}) {
    super();
  }

  override repositories({ db }: ModuleRepositoriesContext<TagModuleDeps, TagModuleTables>) {
    return {
      tag: new TagRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.tags,
      }),
    };
  }

  override services({ repositories }: ModuleServicesContext<TagModuleDeps, TagModuleRepositories>) {
    return {
      tag: new TagService({ tag: repositories.tag }, {}),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<TagModuleDeps, TagModuleServices>) {
    const namespace = (this.options.namespace ?? "tag") as Namespace;
    return createBackendRouterMap(namespace, createTagTRPC(trpc, services.tag));
  }
}
