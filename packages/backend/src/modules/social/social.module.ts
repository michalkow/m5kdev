import { SocialService } from "./social.service";
import type { SocialProvider } from "./social.types";
import type { ConnectModule } from "../connect/connect.module";
import type { FileModule } from "../file/file.module";
import { BaseModule, type ModuleServicesContext, type TableMap } from "../base/base.module";

type SocialModuleDeps = { connect: ConnectModule; file: FileModule };
type SocialModuleTables = TableMap;
type SocialModuleRepositories = Record<string, never>;
type SocialModuleServices = {
  social: SocialService;
};
type SocialModuleRouters = never;

export class SocialModule extends BaseModule<
  SocialModuleDeps,
  SocialModuleTables,
  SocialModuleRepositories,
  SocialModuleServices,
  SocialModuleRouters
> {
  readonly id = "social";
  override readonly dependsOn = ["connect", "file"] as const;

  constructor(private readonly providers: SocialProvider[]) {
    super();
  }

  override services({ deps }: ModuleServicesContext<SocialModuleDeps, SocialModuleRepositories>) {
    return {
      social: new SocialService(
        {
          connect: deps.connect.repositories.connect,
        },
        {
          connect: deps.connect.services.connect,
          file: deps.file.services.file,
        },
        this.providers
      ),
    };
  }
}
