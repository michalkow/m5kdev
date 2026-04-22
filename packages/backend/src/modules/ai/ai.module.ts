import type { Mastra } from "@mastra/core";
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
import { AiUsageRepository } from "./ai.repository";
import { AIService } from "./ai.service";
import { IdeogramRepository } from "./ideogram/ideogram.repository";
import { IdeogramService } from "./ideogram/ideogram.service";
import { createAITRPC } from "./ai.trpc";

export type AIModuleConfig<
  MastraInstance extends Mastra,
  Namespace extends string = string,
> = {
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
  };
};

type AIModuleDeps = { auth: AuthModule };
type AIModuleTables = typeof aiTables;
type AIModuleRepositories = {
  aiUsage: AiUsageRepository;
  ideogram?: IdeogramRepository;
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

  constructor(private readonly config: AIModuleConfig<MastraInstance, Namespace>) {
    super();
  }

  override repositories({ db }: ModuleRepositoriesContext<AIModuleDeps, AIModuleTables>) {
    return {
      aiUsage: new AiUsageRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.aiUsage,
      }),
      ...(this.config.enableIdeogram ? { ideogram: new IdeogramRepository() } : {}),
    };
  }

  override services({ repositories }: ModuleServicesContext<AIModuleDeps, AIModuleRepositories>) {
    const ideogram = repositories.ideogram
      ? new IdeogramService({ ideogram: repositories.ideogram }, undefined as never)
      : undefined;

    return {
      ...(ideogram ? { ideogram } : {}),
      ai: new AIService<MastraInstance>(
        { aiUsage: repositories.aiUsage },
        ideogram ? { ideogram } : {},
        this.config.libs,
        this.config.options
      ),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<AIModuleDeps, AIModuleServices<MastraInstance>>) {
    const namespace = (this.config.namespace ?? "ai") as Namespace;
    return createBackendRouterMap(namespace, createAITRPC(trpc, services.ai));
  }
}
