import type { Statements } from "better-auth/plugins/access";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type TableMap,
} from "../base/base.module";
import { AccessRepository } from "./access.repository";
import { AccessService } from "./access.service";
import type { AccessControlRoles } from "./access.utils";

type AccessModuleDeps = { auth: AuthModule };
type AccessModuleTables = TableMap;
type AccessModuleRepositories = {
  access: AccessRepository;
};
type AccessModuleServices<T extends Statements = Statements> = {
  access: AccessService<T>;
};
type AccessModuleRouters = never;

export class AccessModule<T extends Statements = Statements> extends BaseModule<
  AccessModuleDeps,
  AccessModuleTables,
  AccessModuleRepositories,
  AccessModuleServices<T>,
  AccessModuleRouters
> {
  readonly id = "access";
  override readonly dependsOn = ["auth"] as const;

  constructor(private readonly acr: AccessControlRoles<T>) {
    super();
  }

  override repositories({ db }: ModuleRepositoriesContext<AccessModuleDeps, AccessModuleTables>) {
    return {
      access: new AccessRepository({
        orm: db.orm,
        schema: db.schema,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<AccessModuleDeps, AccessModuleRepositories>) {
    return {
      access: new AccessService({ access: repositories.access }, this.acr),
    };
  }
}
