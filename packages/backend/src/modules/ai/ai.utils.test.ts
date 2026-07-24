import { RANKED_MODELS } from "@m5kdev/commons/modules/ai/ai.constants";
import type { RankedModel } from "@m5kdev/commons/modules/ai/ai.types";
import { getSortedRecommendedModelIds, rankModels } from "@m5kdev/commons/modules/ai/ai.utils";
import { resolveModels, resolveRetryModels } from "./ai.utils";

const tokenProfile = { inputTokens: 1_000, outputTokens: 500 };

function createRankedModel(id: string, responseTimeSeconds?: number): RankedModel {
  return {
    id,
    inputCost: 1,
    outputCost: 1,
    responseTimeSeconds,
    quality: {
      structured_output: 5,
      creative: 5,
      research: 5,
      chat: 5,
      tool_use: 5,
      planning: 5,
      classification: 5,
    },
  };
}

describe("AI model resolution", () => {
  it("moves failed preferred models behind models without failures", () => {
    const failureCounts = new Map([["custom/failed", 1]]);

    const resolved = resolveModels({
      preferredModels: ["custom/failed", "custom/healthy"],
      failureCounts,
    });

    expect(resolved[0]).toBe("custom/healthy");
    expect(resolved.at(-1)).toBe("custom/failed");
  });

  it("preserves preferred and weighted order when failure counts are equal", () => {
    const recommended = getSortedRecommendedModelIds("chat");
    const resolved = resolveModels({
      preferredModels: ["custom/first", "custom/second"],
      failureCounts: new Map(),
    });

    expect(resolved).toEqual(["custom/first", "custom/second", ...recommended]);
  });

  it("sorts arbitrary preferred model IDs by ascending failure count", () => {
    const recommended = getSortedRecommendedModelIds("chat");
    const failureCounts = new Map<string, number>([
      ["custom/two-failures", 2],
      ["custom/one-failure", 1],
      ...recommended.map((model) => [model, 3] as const),
    ]);

    const resolved = resolveModels({
      preferredModels: ["custom/two-failures", "custom/one-failure"],
      failureCounts,
    });

    expect(resolved.slice(0, 2)).toEqual(["custom/one-failure", "custom/two-failures"]);
  });

  it("does not reorder explicit model selections", () => {
    const failureCounts = new Map([
      ["custom/first", 10],
      ["custom/second", 0],
    ]);

    expect(
      resolveModels({
        models: ["custom/first", "custom/second"],
        failureCounts,
      })
    ).toEqual(["custom/first", "custom/second"]);
    expect(resolveModels({ model: "custom/first", failureCounts })).toEqual(["custom/first"]);
  });

  it("keeps active retry rotation independent from failure sorting", () => {
    expect(resolveRetryModels(["first", "second", "third"])).toEqual(["second", "third", "first"]);
  });
});

describe("AI model response-time scoring", () => {
  it("stores benchmark seconds instead of normalized speed ranks", () => {
    const slowBenchmarkModel = RANKED_MODELS.find((model) => model.id === "openai/gpt-5.6-sol-pro");

    expect(slowBenchmarkModel?.responseTimeSeconds).toBe(162.47);
    expect(slowBenchmarkModel?.responseTimeSeconds).toBeGreaterThan(10);
    expect(RANKED_MODELS.some((model) => "speed" in model)).toBe(false);
  });

  it("normalizes dominant speed weight using inverse response time", () => {
    const ranked = rankModels(
      [createRankedModel("twice-as-slow", 4), createRankedModel("fastest", 2)],
      tokenProfile,
      "chat",
      [0, 0, 100]
    );

    expect(ranked.find((model) => model.id === "fastest")?.speedScore).toBe(10);
    expect(ranked.find((model) => model.id === "twice-as-slow")?.speedScore).toBe(5);
    expect(ranked.map((model) => model.id)).toEqual(["fastest", "twice-as-slow"]);
  });

  it("keeps close response times proportionally close", () => {
    const ranked = rankModels(
      [createRankedModel("fastest", 2), createRankedModel("close", 2.2)],
      tokenProfile,
      "chat",
      [0, 0, 100]
    );

    expect(ranked.find((model) => model.id === "close")?.speedScore).toBeCloseTo(9.09, 2);
  });

  it("uses the measured median for missing response times without mutating model data", () => {
    const missing = createRankedModel("missing");
    const ranked = rankModels(
      [createRankedModel("fastest", 2), missing, createRankedModel("slowest", 4)],
      tokenProfile,
      "chat",
      [0, 0, 100]
    );

    expect(ranked.find((model) => model.id === "missing")?.speedScore).toBeCloseTo(6.67, 2);
    expect(missing.responseTimeSeconds).toBeUndefined();
    expect("speedScore" in missing).toBe(false);
  });

  it("keeps an entirely unmeasured model set neutrally ordered", () => {
    const ranked = rankModels(
      [createRankedModel("first"), createRankedModel("second"), createRankedModel("third")],
      tokenProfile,
      "chat",
      [0, 0, 100]
    );

    expect(ranked.map((model) => model.id)).toEqual(["first", "second", "third"]);
    expect(ranked.every((model) => model.speedScore === 10)).toBe(true);
  });

  it("does not let speed dominate a quality-focused preset", () => {
    const highQuality = createRankedModel("high-quality", 100);
    highQuality.quality.chat = 10;
    const fast = createRankedModel("fast", 1);
    fast.quality.chat = 1;

    const ranked = rankModels([fast, highQuality], tokenProfile, "chat", [50, 30, 20]);

    expect(ranked.map((model) => model.id)).toEqual(["high-quality", "fast"]);
  });

  it("does not let speed dominate a price-focused preset", () => {
    const affordable = createRankedModel("affordable", 100);
    affordable.inputCost = 0.1;
    affordable.outputCost = 0.1;
    const fast = createRankedModel("fast", 1);
    fast.inputCost = 10;
    fast.outputCost = 10;

    const ranked = rankModels([fast, affordable], tokenProfile, "chat", [20, 50, 30]);

    expect(ranked.map((model) => model.id)).toEqual(["affordable", "fast"]);
  });
});
