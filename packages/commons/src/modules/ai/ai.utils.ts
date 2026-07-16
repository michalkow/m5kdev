import { RANKED_MODELS, TOKEN_PRESETS } from "./ai.constants";
import type { Category, RankedModel, SortType, TokenProfile, TokenSize } from "./ai.types";

export function getDefaultTokenProfile(category: Category): TokenProfile {
  switch (category) {
    case "structured_output":
      return { inputTokens: TOKEN_PRESETS.lg, outputTokens: TOKEN_PRESETS.md };
    case "creative":
      return { inputTokens: TOKEN_PRESETS.md, outputTokens: TOKEN_PRESETS.lg };
    case "research":
      return { inputTokens: TOKEN_PRESETS.xl, outputTokens: TOKEN_PRESETS.xl };
    case "chat":
      return { inputTokens: TOKEN_PRESETS.sm, outputTokens: TOKEN_PRESETS.md };
    case "tool_use":
      return { inputTokens: TOKEN_PRESETS.md, outputTokens: TOKEN_PRESETS.sm };
    case "planning":
      return { inputTokens: TOKEN_PRESETS.lg, outputTokens: TOKEN_PRESETS.lg };
    case "classification":
      return { inputTokens: TOKEN_PRESETS.sm, outputTokens: TOKEN_PRESETS.xs };
    default:
      return { inputTokens: TOKEN_PRESETS.md, outputTokens: TOKEN_PRESETS.md };
  }
}

export function getDefaultWeights(
  weights?: SortType | [SortType, SortType, SortType] | [number, number, number]
): [number, number, number] {
  if (Array.isArray(weights)) {
    return weights.every((weight) => typeof weight === "number")
      ? weights
      : weights.reduce<[number, number, number]>(
          (acc, weight, index) => {
            switch (weight) {
              case "quality":
                acc[0] = index === 0 ? 50 : index === 1 ? 30 : 20;
                break;
              case "price":
                acc[1] = index === 0 ? 50 : index === 1 ? 30 : 20;
                break;
              case "speed":
                acc[2] = index === 0 ? 50 : index === 1 ? 30 : 20;
                break;
            }
            return acc;
          },
          [20, 50, 30]
        );
  }
  switch (weights) {
    case "quality":
      return [50, 30, 20];
    case "price":
      return [20, 50, 30];
    case "speed":
      return [20, 30, 50];
    default:
      return [50, 25, 25];
  }
}

export function weightsToPriceSensitivity(weights: [number, number, number]): number {
  const [qualityWeight, priceWeight, speedWeight] = weights;

  const total = qualityWeight + priceWeight + speedWeight;

  if (total <= 0) {
    return 1;
  }

  const normalizedPriceWeight = priceWeight / total;

  const min = 0.55; // very price-sensitive
  const max = 1.75; // price is soft / secondary

  // Higher price weight -> lower exponent -> stronger price penalty.
  const sensitivity = max - normalizedPriceWeight * (max - min);

  return Number(sensitivity.toFixed(3));
}

export function addPriceScores(
  models: RankedModel[],
  profile: TokenProfile,
  priceSensitivity = 1
): Array<RankedModel & { price: number; estimatedCost: number }> {
  const costs = models.map((model) => {
    return (
      (profile.inputTokens / 1_000_000) * model.inputCost +
      (profile.outputTokens / 1_000_000) * model.outputCost
    );
  });

  const cheapest = Math.min(...costs);
  const mostExpensive = Math.max(...costs);

  return models.map((model, index) => {
    const cost = costs[index];

    if (mostExpensive === cheapest) {
      return {
        ...model,
        estimatedCost: cost,
        price: 10,
      };
    }

    const safeCheapest = Math.max(cheapest, Number.EPSILON);
    const safeCost = Math.max(cost, Number.EPSILON);
    const safeMostExpensive = Math.max(mostExpensive, Number.EPSILON);

    const logMin = Math.log(safeCheapest);
    const logMax = Math.log(safeMostExpensive);
    const logCost = Math.log(safeCost);

    const normalizedRaw = (logCost - logMin) / (logMax - logMin);

    // < 1 makes price matter less.
    // > 1 makes price matter more.
    const normalized = normalizedRaw ** priceSensitivity;

    return {
      ...model,
      estimatedCost: cost,
      price: Math.round(10 - normalized * 9),
    };
  });
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, value));
}

function shapeScoreByWeight(value: number, weight: number, maxWeight: number): number {
  const score = clampScore(value);
  const normalized = score / 10;

  if (maxWeight <= 0 || weight <= 0) {
    return 0;
  }

  const importance = (weight / maxWeight) ** 2;
  const expanded = normalized ** 2 * 10;
  const compressed = 8 + normalized * 2;
  return compressed + (expanded - compressed) * importance;
}

export function rankModels(
  models: RankedModel[],
  profile: TokenProfile,
  category: Category,
  weights: [number, number, number]
) {
  const scoredModels = addPriceScores(models, profile, weightsToPriceSensitivity(weights));

  const [qualityWeight, priceWeight, speedWeight] = weights;
  const maxWeight = Math.max(qualityWeight, priceWeight, speedWeight);

  return scoredModels
    .map((model) => {
      const qualityScore = shapeScoreByWeight(model.quality[category], qualityWeight, maxWeight);

      const priceScore = shapeScoreByWeight(model.price, priceWeight, maxWeight);

      const speedScore = shapeScoreByWeight(model.speed, speedWeight, maxWeight);

      return {
        ...model,
        score: qualityScore * qualityWeight + priceScore * priceWeight + speedScore * speedWeight,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function getSortedRankedModel(
  models: RankedModel[],
  category: Category = "chat",
  weights?: SortType | [SortType, SortType, SortType] | [number, number, number],
  tokenProfile?: TokenProfile | number | TokenSize,
  filter?: (model: RankedModel) => boolean
): RankedModel[] {
  const profile =
    typeof tokenProfile === "string"
      ? {
          inputTokens: TOKEN_PRESETS[tokenProfile as TokenSize],
          outputTokens: TOKEN_PRESETS[tokenProfile as TokenSize],
        }
      : typeof tokenProfile === "number"
        ? { inputTokens: tokenProfile, outputTokens: tokenProfile }
        : tokenProfile
          ? (tokenProfile as TokenProfile)
          : getDefaultTokenProfile(category);
  return rankModels(models, profile, category, getDefaultWeights(weights));
}

export function getSortedRecommendedModels(
  category: Category = "chat",
  weights?: SortType | [SortType, SortType, SortType] | [number, number, number],
  tokenProfile?: TokenProfile | number | TokenSize,
  filter?: (model: RankedModel) => boolean
): RankedModel[] {
  return getSortedRankedModel(RANKED_MODELS, category, weights, tokenProfile);
}

export function getSortedRecommendedModelIds(
  category: Category = "chat",
  weights?: SortType | [SortType, SortType, SortType] | [number, number, number],
  tokenProfile?: TokenProfile | number | TokenSize,
  filter?: (model: RankedModel) => boolean
): string[] {
  return getSortedRankedModel(RANKED_MODELS, category, weights, tokenProfile).map(
    (model) => model.id
  );
}

export function arrayToPseudoXML<T extends Record<string, unknown>>(
  array: readonly T[],
  keys: readonly (keyof T)[],
  name = "item"
): string {
  return array
    .map(
      (item) =>
        `<${name}>${keys
          .map((key) => `<${String(key)}>${String(item[key])}</${String(key)}>`)
          .join("\n")}</${name}>`
    )
    .join("\n");
}
