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

function sortModelsByFailures(
  models: string[],
  failureCounts?: ReadonlyMap<string, number>
): string[] {
  if (!failureCounts) return models;

  return models
    .map((model, index) => ({
      failures: failureCounts.get(model) ?? 0,
      index,
      model,
    }))
    .sort((a, b) => a.failures - b.failures || a.index - b.index)
    .map(({ model }) => model);
}

export function resolveModels(params: {
  models?: string[];
  presetModels?: PresetModels;
  preferredModels?: string[];
  model?: string;
  defaultCategory?: Category;
  failureCounts?: ReadonlyMap<string, number>;
}): string[] {
  const {
    models,
    presetModels,
    model,
    preferredModels,
    defaultCategory = "chat",
    failureCounts,
  } = params;
  if (models) return models;
  if (presetModels) {
    const recommendedModels = getSortedRecommendedModelIds(
      presetModels.category,
      presetModels.weights,
      presetModels.tokenProfile
    );
    const resolvedModels = preferredModels
      ? Array.from(new Set([...preferredModels, ...recommendedModels]))
      : recommendedModels;
    return sortModelsByFailures(resolvedModels, failureCounts);
  }
  if (model) return [model];
  const defaultModels = getSortedRecommendedModelIds(defaultCategory);
  const resolvedModels = preferredModels
    ? Array.from(new Set([...preferredModels, ...defaultModels]))
    : defaultModels;
  return sortModelsByFailures(resolvedModels, failureCounts);
}

export function resolveRetryModels(retryModels: string[]): string[] {
  const [model] = retryModels;
  return retryModels.length > 1 ? [...retryModels.slice(1), model] : [model];
}
