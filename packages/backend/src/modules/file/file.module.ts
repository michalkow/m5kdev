import { tmpdir } from "node:os";
import path from "node:path";
import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import type { WorkflowModule } from "../workflow/workflow.module";
import type { Grant } from "../base/base.grants";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as fileTables from "./file.db";
import { defaultFileGrants } from "./file.grants";
import { LocalFileObjectStore } from "./file.local-store";
import { createMockS3Router, FILE_S3_MOCK_MOUNT } from "./file.mock-s3.router";
import { FileRepository, FileS3Repository } from "./file.repository";
import { createDownloadRouter } from "./file.download.router";
import { createUploadRouter } from "./file.router";
import { FileService } from "./file.service";
import { createFileTRPC } from "./file.trpc";

export interface FileModuleConfig {
  readonly uploadPath?: string;
  readonly downloadPath?: string;
  readonly grants?: Grant[];
  readonly buckets?: readonly string[];
  readonly deleteAfterDays?: number;
}

type FileModuleDeps = { auth: AuthModule; workflow?: WorkflowModule };
type FileModuleTables = typeof fileTables;
type FileModuleRepositories = {
  file: FileRepository;
  fileS3: FileS3Repository | LocalFileObjectStore;
};
type FileModuleServices = {
  file: FileService;
};
type FileModuleRouters = {
  file: ReturnType<typeof createFileTRPC>;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function defaultBuckets(): string[] {
  const envBucket = process.env.AWS_S3_BUCKET;
  return envBucket ? [envBucket] : [];
}

function localStorePublicBaseUrl(): string {
  return (process.env.VITE_SERVER_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`).replace(
    /\/$/,
    ""
  );
}

export class FileModule extends BaseModule<
  FileModuleDeps,
  FileModuleTables,
  FileModuleRepositories,
  FileModuleServices,
  FileModuleRouters
> {
  readonly id = "file";
  override readonly dependsOn = ["auth"] as const;
  override readonly optionalDependsOn = ["workflow"] as const;
  private readonly grants: Grant[];
  private readonly uploadPath: string;
  readonly downloadPath: string;
  private readonly buckets: readonly string[];
  private readonly deleteAfterDays: number;
  private localStore: LocalFileObjectStore | undefined;

  constructor(config: FileModuleConfig | string = {}, grants?: Grant[]) {
    super();
    if (typeof config === "string") {
      this.uploadPath = config;
      this.downloadPath = "/files";
      this.grants = grants ?? defaultFileGrants;
      this.buckets = defaultBuckets();
      this.deleteAfterDays = 30;
      return;
    }
    this.uploadPath = config.uploadPath ?? "/upload";
    this.downloadPath = config.downloadPath ?? "/files";
    this.grants = config.grants ?? defaultFileGrants;
    this.buckets = config.buckets ?? defaultBuckets();
    this.deleteAfterDays = config.deleteAfterDays ?? 30;
  }

  override repositories({ db }: ModuleRepositoriesContext<FileModuleDeps, FileModuleTables>) {
    const defaultBucket = this.buckets[0] ?? process.env.AWS_S3_BUCKET ?? "local-s3";
    const fileS3: FileS3Repository | LocalFileObjectStore = isProduction()
      ? new FileS3Repository()
      : new LocalFileObjectStore({
          root: path.join(tmpdir(), "m5kdev-file-s3"),
          publicBaseUrl: localStorePublicBaseUrl(),
          defaultBucket,
        });
    if (fileS3 instanceof LocalFileObjectStore) {
      this.localStore = fileS3;
    }
    return {
      file: new FileRepository({
        orm: db.orm,
        schema: db.schema,
      }),
      fileS3,
    };
  }

  override services({
    repositories,
    deps,
  }: ModuleServicesContext<FileModuleDeps, FileModuleRepositories>) {
    return {
      file: new FileService(
        {
          file: repositories.file,
          fileS3: repositories.fileS3,
        },
        {},
        this.grants,
        {
          buckets: this.buckets,
          deleteAfterDays: this.deleteAfterDays,
          purgeObjectOnDelete: !deps.workflow,
        }
      ),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<FileModuleDeps, FileModuleServices>) {
    return createBackendRouterMap("file", createFileTRPC(trpc, services.file));
  }

  override express({
    infra,
    services,
    authMiddleware,
    deps,
  }: ModuleExpressContext<FileModuleDeps, FileModuleServices>) {
    if (this.localStore && !isProduction()) {
      infra.express.use(FILE_S3_MOCK_MOUNT, createMockS3Router(this.localStore));
    }
    if (!authMiddleware) return;
    infra.express.use(
      this.downloadPath,
      createDownloadRouter({
        authMiddleware,
        fileService: services.file,
        memberships: deps.auth.repositories.organization,
      })
    );
    infra.express.use(
      this.uploadPath,
      createUploadRouter({
        authMiddleware,
        fileService: services.file,
      })
    );
  }
}
