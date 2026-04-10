import { defineBackendModule } from "../../app";
import { createFileTables } from "./file.db";
import { FileRepository, FileS3Repository } from "./file.repository";
import { createUploadRouter } from "./file.router";
import { FileService } from "./file.service";

export type CreateFileBackendModuleOptions = {
  id?: string;
  mountPath?: string;
  authModuleId?: string;
};

export function createFileBackendModule(options: CreateFileBackendModuleOptions = {}) {
  const id = options.id ?? "file";
  const mountPath = options.mountPath ?? "/upload";
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    db: ({ deps }) => {
      const authTables = deps[authModuleId].tables as any;
      return {
      tables: createFileTables({
        users: authTables.users,
        organizations: authTables.organizations,
        teams: authTables.teams,
      }),
      };
    },
    repositories: ({ db }) => ({
      file: new FileRepository({
        orm: db.orm as never,
        schema: db.schema as never,
      }),
      fileS3: new FileS3Repository(),
    }),
    services: ({ repositories }) => ({
      file: new FileService(
        {
          file: repositories.file,
          fileS3: repositories.fileS3,
        },
        undefined as never
      ),
    }),
    express: ({ infra, services, authMiddleware }) => {
      if (!authMiddleware) return;
      infra.express.use(
        mountPath,
        createUploadRouter({
          authMiddleware,
          fileService: services.file,
        })
      );
    },
  });
}
