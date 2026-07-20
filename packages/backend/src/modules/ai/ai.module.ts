import type { Mastra } from "@mastra/core";
import { LibSQLVector } from "@mastra/libsql";
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import type Replicate from "replicate";
import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as aiTables from "./ai.db";
import { AiUsageRepository, AiVectorRepository } from "./ai.repository";
import { AIService } from "./ai.service";
import { createAITRPC } from "./ai.trpc";
import type { PresetModels } from "./ai.utils";
import { type AiVectorStoreConfig, createAiVectorStore } from "./ai.vector";
import { IdeogramRepository } from "./ideogram/ideogram.repository";
import { IdeogramService } from "./ideogram/ideogram.service";

export type AIModuleConfig<MastraInstance extends Mastra, Namespace extends string = string> = {
  namespace?: Namespace;
  enableIdeogram?: boolean;
  libs: {
    mastra?: MastraInstance;
    openrouter?: OpenRouterProvider;
    replicate?: Replicate;
  };
  options?: {
    retryAttempts?: number;
    retryModels?: string[];
    repairAttempts?: number;
    repairModel?: string;
    removeMDash?: boolean;
    objectPreset?: PresetModels;
    textPreset?: PresetModels;
  };
  /**
   * Either a preconfigured store (caller owns its lifecycle) or a config the
   * module resolves via {@link createAiVectorStore} and closes on shutdown:
   * remote URLs are used directly, a local file only as a dev fallback.
   */
  vectorStore?: LibSQLVector | AiVectorStoreConfig;
};

type AIModuleDeps = { auth: AuthModule };
type AIModuleTables = typeof aiTables;
type AIModuleRepositories = {
  aiUsage: AiUsageRepository;
  ideogram?: IdeogramRepository;
  aiVector?: AiVectorRepository;
};
type AIModuleServices<MastraInstance extends Mastra> = {
  ai: AIService<MastraInstance>;
  ideogram?: IdeogramService;
};
type AIModuleRouters<Namespace extends string> = {
  [K in Namespace]: ReturnType<typeof createAITRPC>;
};

export class AIModule<
  MastraInstance extends Mastra,
  const Namespace extends string = "ai",
> extends BaseModule<
  AIModuleDeps,
  AIModuleTables,
  AIModuleRepositories,
  AIModuleServices<MastraInstance>,
  AIModuleRouters<Namespace>
> {
  readonly id = "ai";
  override readonly dependsOn = ["auth"] as const;

  private ownedVectorStore?: LibSQLVector;

  constructor(private readonly config: AIModuleConfig<MastraInstance, Namespace>) {
    super();
  }

  private resolveVectorStore(args: {
    env: Record<string, string | undefined>;
    databaseUrl?: string;
  }): LibSQLVector | undefined {
    if (!this.config.vectorStore) return undefined;
    if (this.config.vectorStore instanceof LibSQLVector) return this.config.vectorStore;
    this.ownedVectorStore ??= createAiVectorStore(this.config.vectorStore, {
      env: args.env,
      databaseUrl: args.databaseUrl,
    });
    return this.ownedVectorStore;
  }

  override repositories({ db, env }: ModuleRepositoriesContext<AIModuleDeps, AIModuleTables>) {
    const vectorStore = this.resolveVectorStore({ env, databaseUrl: db.url });
    return {
      aiUsage: new AiUsageRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.aiUsage,
      }),
      ...(this.config.enableIdeogram ? { ideogram: new IdeogramRepository() } : {}),
      ...(vectorStore ? { aiVector: new AiVectorRepository(vectorStore) } : {}),
    };
  }

  override async shutdown() {
    await this.ownedVectorStore?.close();
  }

  override services({ repositories }: ModuleServicesContext<AIModuleDeps, AIModuleRepositories>) {
    const ideogram = repositories.ideogram
      ? new IdeogramService({ ideogram: repositories.ideogram }, undefined as never)
      : undefined;

    return {
      ...(ideogram ? { ideogram } : {}),
      ai: new AIService<MastraInstance>(
        { aiUsage: repositories.aiUsage, aiVector: repositories.aiVector },
        ideogram ? { ideogram } : {},
        this.config.libs,
        this.config.options
      ),
    };
  }

  override trpc({
    trpc,
    services,
  }: ModuleTRPCContext<AIModuleDeps, AIModuleServices<MastraInstance>>) {
    const namespace = (this.config.namespace ?? "ai") as Namespace;
    return createBackendRouterMap(namespace, createAITRPC(trpc, services.ai));
  }
}
