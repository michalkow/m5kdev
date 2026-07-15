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
  model?: string;
  defaultCategory?: Category;
}): string[] {
  const { models, presetModels, model, defaultCategory = "chat" } = params;
  return models
    ? models
    : presetModels
      ? getSortedRecommendedModelIds(
          presetModels.category,
          presetModels.weights,
          presetModels.tokenProfile
        )
      : model
        ? [model]
        : getSortedRecommendedModelIds(defaultCategory);
}

export function resolveRetryModels(retryModels: string[]): string[] {
  const [model] = retryModels;
  return retryModels.length > 1 ? [...retryModels.slice(1), model] : [model];
}
