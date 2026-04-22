import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
} from "../base/base.module";
import type * as fileTables from "./file.db";
import { FileRepository, FileS3Repository } from "./file.repository";
import { createUploadRouter } from "./file.router";
import { FileService } from "./file.service";

type FileModuleDeps = { auth: AuthModule };
type FileModuleTables = typeof fileTables;
type FileModuleRepositories = {
  file: FileRepository;
  fileS3: FileS3Repository;
};
type FileModuleServices = {
  file: FileService;
};
type FileModuleRouters = never;

export class FileModule extends BaseModule<
  FileModuleDeps,
  FileModuleTables,
  FileModuleRepositories,
  FileModuleServices,
  FileModuleRouters
> {
  readonly id = "file";
  override readonly dependsOn = ["auth"] as const;

  constructor(private readonly mountPath: string = "/upload") {
    super();
  }

  override repositories({ db }: ModuleRepositoriesContext<FileModuleDeps, FileModuleTables>) {
    return {
      file: new FileRepository({
        orm: db.orm,
        schema: db.schema,
      }),
      fileS3: new FileS3Repository(),
    };
  }

  override services({ repositories }: ModuleServicesContext<FileModuleDeps, FileModuleRepositories>) {
    return {
      file: new FileService(
        {
          file: repositories.file,
          fileS3: repositories.fileS3,
        },
        undefined as never
      ),
    };
  }

  override express({ infra, services, authMiddleware }: ModuleExpressContext<FileModuleDeps, FileModuleServices>) {
    if (!authMiddleware) return;
    infra.express.use(
      this.mountPath,
      createUploadRouter({
        authMiddleware,
        fileService: services.file,
      })
    );
  }
}
