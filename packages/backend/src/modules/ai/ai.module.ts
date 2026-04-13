import type { Mastra } from "@mastra/core";
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import type Replicate from "replicate";
import { createBackendRouterMap, defineBackendModule } from "../../app";
import { createAITables } from "./ai.db";
import { AiUsageRepository } from "./ai.repository";
import { AIService } from "./ai.service";
import { IdeogramRepository } from "./ideogram/ideogram.repository";
import { IdeogramService } from "./ideogram/ideogram.service";
import { createAITRPC } from "./ai.trpc";

export type CreateAIBackendModuleOptions<
  MastraInstance extends Mastra,
  Namespace extends string = string,
> = {
  id?: string;
  namespace?: Namespace;
  authModuleId?: string;
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

export function createAIBackendModule<
  MastraInstance extends Mastra,
  const Namespace extends string = "ai",
>(options: CreateAIBackendModuleOptions<MastraInstance, Namespace>) {
  const id = options.id ?? "ai";
  const namespace = (options.namespace ?? "ai") as Namespace;
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    db: ({ deps }) => {
      const authTables = deps[authModuleId].tables as any;
      return {
      tables: createAITables({
        users: authTables.users,
        organizations: authTables.organizations,
        teams: authTables.teams,
      }),
      };
    },
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        aiUsage: new AiUsageRepository({
          orm: db.orm as never,
          schema: schema,
          table: schema.aiUsage,
        }),
        ...(options.enableIdeogram ? { ideogram: new IdeogramRepository() } : {}),
      };
    },
    services: ({ repositories }) => {
      const repo = repositories as any;
      const ideogram = repo.ideogram
        ? new IdeogramService({ ideogram: repo.ideogram }, undefined as never)
        : undefined;

      return {
        ...(ideogram ? { ideogram } : {}),
        ai: new AIService(
          { aiUsage: repo.aiUsage },
          ideogram ? { ideogram } : {},
          options.libs,
          options.options
        ),
      };
    },
    trpc: ({ trpc, services }) =>
      createBackendRouterMap(namespace, createAITRPC(trpc, services.ai)),
  });
}
