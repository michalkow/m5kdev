import type {
  Category,
  SortType,
  TokenProfile,
  TokenSize,
} from "@m5kdev/commons/modules/ai/ai.types";
import { getSortedRecommendedModelIds } from "@m5kdev/commons/modules/ai/ai.utils";

export type PresetModels = {
  category: Category;
  weights?: SortType | [SortType, SortType, SortType] | [number, number, number];
  tokenProfile?: TokenProfile | number | TokenSize;
};

export function resolveModels(params: {
  models?: string[];
  presetModels?: PresetModels;
  preferredModels?: string[];
  model?: string;
  defaultCategory?: Category;
}): string[] {
  const { models, presetModels, model, preferredModels, defaultCategory = "chat" } = params;
  if (models) return models;
  if (presetModels) {
    const recommendedModels = getSortedRecommendedModelIds(
      presetModels.category,
      presetModels.weights,
      presetModels.tokenProfile
    );
    if (preferredModels) return Array.from(new Set([...preferredModels, ...recommendedModels]));
    return recommendedModels;
  }
  if (model) return [model];
  return getSortedRecommendedModelIds(defaultCategory);
}

export function resolveRetryModels(retryModels: string[]): string[] {
  const [model] = retryModels;
  return retryModels.length > 1 ? [...retryModels.slice(1), model] : [model];
}
